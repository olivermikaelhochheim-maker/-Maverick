import { describe, expect, it } from "vitest";
import { freshDb, seedUser, testCipher } from "./helpers";
import { CalendarLinkStore, eventsFromIcs, normaliseCalendarUrl } from "../src/integrations/ics";
import { AgendaService } from "../src/integrations/calendar";
import { IntegrationStore } from "../src/integrations/store";
import { zonedToUtc } from "../src/util/time";

const LINK = "https://calendar.google.com/calendar/ical/oliver%40gmail.com/private-0123456789abcdef/basic.ics";

// Shaped like Google Calendar's "Secret address in iCal format" export.
const ICS = [
  "BEGIN:VCALENDAR",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "VERSION:2.0",
  "X-WR-CALNAME:Oliver",
  "X-WR-TIMEZONE:Europe/Oslo",
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Oslo",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
  // Weekly gym, Mon/Thu 17:30 Oslo time; 12 Nov moved to 19:00, 9 Nov skipped.
  "BEGIN:VEVENT",
  "UID:gym@google.com",
  "DTSTART;TZID=Europe/Oslo:20261001T173000",
  "DTEND;TZID=Europe/Oslo:20261001T183000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,TH",
  "EXDATE;TZID=Europe/Oslo:20261109T173000",
  "SUMMARY:Gym",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:gym@google.com",
  "RECURRENCE-ID;TZID=Europe/Oslo:20261112T173000",
  "DTSTART;TZID=Europe/Oslo:20261112T190000",
  "DTEND;TZID=Europe/Oslo:20261112T200000",
  "SUMMARY:Gym (late)",
  "END:VEVENT",
  // One-off in UTC.
  "BEGIN:VEVENT",
  "UID:exam@google.com",
  "DTSTART:20261120T080000Z",
  "DTEND:20261120T110000Z",
  "SUMMARY:Statistics exam",
  "LOCATION:BI Stavanger",
  "END:VEVENT",
  // All-day.
  "BEGIN:VEVENT",
  "UID:shift@google.com",
  "DTSTART;VALUE=DATE:20261112",
  "DTEND;VALUE=DATE:20261113",
  "SUMMARY:Widerøe shift",
  "END:VEVENT",
  // Cancelled.
  "BEGIN:VEVENT",
  "UID:cancelled@google.com",
  "DTSTART:20261112T120000Z",
  "DTEND:20261112T130000Z",
  "STATUS:CANCELLED",
  "SUMMARY:Cancelled lunch",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const TZ = "Europe/Oslo";
const day = (d: string) => ({ from: zonedToUtc(d, "00:00", TZ), to: zonedToUtc(d, "23:59", TZ) });

function fakeFetch(routes: Record<string, { status: number; body?: string; location?: string }>): typeof fetch {
  return (async (input: string | URL) => {
    const r = routes[String(input)];
    if (!r) throw new Error(`unexpected fetch ${String(input)}`);
    return new Response(r.body ?? "", { status: r.status, headers: r.location ? { location: r.location } : {} });
  }) as typeof fetch;
}

describe("calendar link (iCal)", () => {
  it("accepts Google's secret iCal address and refuses anything else", () => {
    expect(normaliseCalendarUrl(` ${LINK} `).toString()).toBe(LINK);
    expect(normaliseCalendarUrl("webcal://p42-caldav.icloud.com/published/2/abc").protocol).toBe("https:");
    expect(() => normaliseCalendarUrl("http://calendar.google.com/calendar/ical/x/private-y/basic.ics")).toThrow(/https/);
    expect(() => normaliseCalendarUrl("https://calendar.google.com/calendar/u/0/r")).toThrow(/Secret address in iCal format/);
    expect(() => normaliseCalendarUrl("https://evil.example/basic.ics")).toThrow(/Google Calendar/);
    expect(() => normaliseCalendarUrl("https://169.254.169.254/latest")).toThrow();
    expect(() => normaliseCalendarUrl("not a link")).toThrow(/isn't a link/);
  });

  it("expands repeats, applies moved and skipped occurrences, keeps all-day events, drops cancelled ones", () => {
    const thu = day("2026-11-12");
    const ev = eventsFromIcs(ICS, thu.from, thu.to, TZ).events;
    expect(ev.map((e) => e.title)).toEqual(["Widerøe shift", "Gym (late)"]);
    expect(ev[0]).toMatchObject({ allDay: true, start: "2026-11-12" });
    expect(ev[1]!.start).toBe("2026-11-12T18:00:00.000Z"); // 19:00 CET

    const mon = day("2026-11-09");
    expect(eventsFromIcs(ICS, mon.from, mon.to, TZ).events).toEqual([]); // EXDATE

    const mon2 = day("2026-11-16");
    expect(eventsFromIcs(ICS, mon2.from, mon2.to, TZ).events.map((e) => [e.title, e.start])).toEqual([["Gym", "2026-11-16T16:30:00.000Z"]]);

    // Summer time is handled by the time zone rules (17:30 CEST = 15:30 UTC).
    const oct = day("2026-10-01");
    expect(eventsFromIcs(ICS, oct.from, oct.to, TZ).events[0]!.start).toBe("2026-10-01T15:30:00.000Z");

    const exam = day("2026-11-20");
    expect(eventsFromIcs(ICS, exam.from, exam.to, TZ).events).toEqual([
      { id: "exam@google.com", title: "Statistics exam", start: "2026-11-20T08:00:00.000Z", end: "2026-11-20T11:00:00.000Z", allDay: false, location: "BI Stavanger", calendar: "Oliver" },
    ]);
  });

  it("connects only after the link returns a real calendar, stores it encrypted, and feeds the agenda", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    const cipher = testCipher();
    const links = new CalendarLinkStore(db, cipher, fakeFetch({ [LINK]: { status: 200, body: ICS } }));
    const agenda = new AgendaService(null, new IntegrationStore(db, cipher), links);

    expect((await agenda.forDay(user.id, TZ, "2026-11-12")).status).toBe("not_configured");
    const info = await links.connect(user.id, LINK, TZ, new Date("2026-11-12T10:00:00Z"));
    expect(info).toMatchObject({ host: "calendar.google.com", calendarName: "Oliver", eventsToday: 2 });
    const { rows } = await db.query<{ url_enc: string }>("SELECT url_enc FROM calendar_links");
    expect(rows[0]!.url_enc).not.toContain("private-0123456789abcdef");

    const a = await agenda.forDay(user.id, TZ, "2026-11-12");
    expect(a.status).toBe("ok");
    expect(a.events.map((e) => e.title)).toEqual(["Widerøe shift", "Gym (late)"]);

    await links.disconnect(user.id);
    expect(await links.info(user.id)).toBeNull();
  });

  it("explains dead links and non-calendars, and never follows a redirect off the calendar hosts", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    const cipher = testCipher();
    const dead = new CalendarLinkStore(db, cipher, fakeFetch({ [LINK]: { status: 404 } }));
    await expect(dead.connect(user.id, LINK, TZ)).rejects.toThrow(/doesn't work any more/);
    const html = new CalendarLinkStore(db, cipher, fakeFetch({ [LINK]: { status: 200, body: "<html>sign in</html>" } }));
    await expect(html.connect(user.id, LINK, TZ)).rejects.toThrow(/didn't return a calendar/);
    const escape = new CalendarLinkStore(db, cipher, fakeFetch({ [LINK]: { status: 302, location: "http://127.0.0.1:5432/" } }));
    await expect(escape.connect(user.id, LINK, TZ)).rejects.toThrow(/https/);
    expect(await dead.info(user.id)).toBeNull();
  });
});

describe("friendly errors across bundles", () => {
  it("recognises a UserFacingError from another copy of the module", async () => {
    const { isUserFacing, UserFacingError } = await import("../src/util/errors");
    expect(isUserFacing(new UserFacingError("x", "y"))).toBe(true);
    // What an error from a second bundle looks like to the first: same shape, different class.
    expect(isUserFacing(Object.assign(new Error("x"), { userFacing: true, code: "y", status: 400 }))).toBe(true);
    expect(isUserFacing(new Error("internal"))).toBe(false);
  });
});
