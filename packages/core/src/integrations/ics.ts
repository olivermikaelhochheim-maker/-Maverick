import ICAL from "ical.js";
import type { Db } from "../db/types";
import type { FieldCipher } from "../util/crypto";
import { audit } from "../audit";
import { UserFacingError } from "../util/errors";
import { localParts, zonedToUtc } from "../util/time";
import type { CalendarEvent } from "./calendar";

/**
 * Calendar from a private iCal link ("Secret address in iCal format" in Google
 * Calendar, or the equivalent in iCloud/Outlook). Read-only by nature: it is a
 * download of the calendar. No Google Cloud project, keys or OAuth needed.
 *
 * The link itself grants read access, so it is stored encrypted, never shown
 * again in full, and only ever fetched from known calendar hosts.
 */

const ALLOWED_HOSTS = [/^calendar\.google\.com$/, /^([a-z0-9-]+\.)*icloud\.com$/, /^outlook\.(office365|office|live)\.com$/];
const MAX_BYTES = 8_000_000;
const TIMEOUT_MS = 15_000;
const CACHE_MS = 5 * 60_000;
const MAX_OCCURRENCES = 5000;

export function normaliseCalendarUrl(raw: unknown): URL {
  if (typeof raw !== "string" || !raw.trim()) throw new UserFacingError("Paste the calendar link.", "bad_input");
  let text = raw.trim();
  if (text.startsWith("webcal://")) text = `https://${text.slice("webcal://".length)}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UserFacingError("That isn't a link. Copy the whole address, starting with https://", "bad_input");
  }
  if (url.protocol !== "https:") throw new UserFacingError("The link must start with https://", "bad_input");
  if (!ALLOWED_HOSTS.some((h) => h.test(url.hostname))) {
    throw new UserFacingError("Use the private link from Google Calendar (calendar.google.com), iCloud or Outlook.", "bad_input");
  }
  if (url.hostname === "calendar.google.com") {
    if (!/^\/calendar\/ical\/[^/]+\/[^/]+\/basic\.ics$/.test(url.pathname)) {
      throw new UserFacingError("That's a Google Calendar link, but not the iCal one. Copy \"Secret address in iCal format\" (it ends with basic.ics).", "bad_input");
    }
  }
  url.hash = "";
  return url;
}

/** Fetch only from allowed hosts, following at most 3 redirects that stay on them. */
async function fetchIcs(start: URL, fetchImpl: typeof fetch): Promise<string> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(url, { redirect: "manual", signal: ctrl.signal, headers: { Accept: "text/calendar" } });
    } catch {
      throw new UserFacingError("Couldn't reach the calendar. Check your internet connection and try again.", "calendar_unreachable");
    } finally {
      clearTimeout(t);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = new URL(res.headers.get("location")!, url);
      url = normaliseCalendarUrl(next.toString());
      continue;
    }
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      throw new UserFacingError("The calendar link doesn't work any more (it may have been reset). Copy the secret address again.", "calendar_link_dead");
    }
    if (!res.ok) throw new UserFacingError(`The calendar service answered with an error (${res.status}). Try again in a minute.`, "calendar_error");
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new UserFacingError("That calendar is too large to read.", "too_large");
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new UserFacingError("That calendar is too large to read.", "too_large");
    if (!text.includes("BEGIN:VCALENDAR")) throw new UserFacingError("That link didn't return a calendar. Copy the secret address in iCal format.", "not_calendar");
    return text;
  }
  throw new UserFacingError("The calendar link redirected too many times.", "calendar_error");
}

/** Events overlapping [from, to), with repeats expanded and cancelled ones left out. */
export function eventsFromIcs(text: string, from: Date, to: Date, tz: string): { name: string | null; events: CalendarEvent[] } {
  const root = new ICAL.Component(ICAL.parse(text) as unknown as unknown[]);
  for (const vtz of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(vtz);
    } catch {
      /* a broken VTIMEZONE: times fall back to UTC/floating handling */
    }
  }
  const name = (root.getFirstPropertyValue("x-wr-calname") as string | null) ?? null;
  const toDate = (t: ICAL.Time): { iso: string; allDay: boolean } => {
    if (t.isDate) return { iso: `${String(t.year).padStart(4, "0")}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`, allDay: true };
    const zone = t.zone?.tzid;
    if (!zone || zone === "floating") {
      // No time zone given: it's wall-clock time in Oliver's zone.
      const date = `${String(t.year).padStart(4, "0")}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
      return { iso: zonedToUtc(date, `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`, tz).toISOString(), allDay: false };
    }
    return { iso: t.toJSDate().toISOString(), allDay: false };
  };

  const vevents = root.getAllSubcomponents("vevent");
  const exceptions = new Map<string, ICAL.Component[]>();
  for (const v of vevents) {
    if (v.hasProperty("recurrence-id")) {
      const uid = String(v.getFirstPropertyValue("uid") ?? "");
      (exceptions.get(uid) ?? exceptions.set(uid, []).get(uid)!).push(v);
    }
  }

  const out: CalendarEvent[] = [];
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const fromDay = localParts(tz, from).date;
  const toDay = localParts(tz, new Date(toMs - 1)).date;
  const push = (ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time, key: string) => {
    if (String(ev.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return;
    const s = toDate(start);
    const e = toDate(end);
    const overlaps = s.allDay ? s.iso <= toDay && (e.iso > fromDay || (e.iso === s.iso && s.iso >= fromDay)) : Date.parse(s.iso) < toMs && Date.parse(e.iso) > fromMs;
    if (!overlaps) return;
    out.push({
      id: key,
      title: (ev.summary || "(no title)").slice(0, 300),
      start: s.iso,
      end: e.iso,
      allDay: s.allDay,
      location: ev.location ? ev.location.slice(0, 300) : null,
      calendar: name ?? "Calendar",
    });
  };

  for (const v of vevents) {
    if (v.hasProperty("recurrence-id")) continue; // handled through its series
    const ev = new ICAL.Event(v);
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) {
      push(ev, ev.startDate, ev.endDate ?? ev.startDate, ev.uid);
      continue;
    }
    for (const ex of exceptions.get(ev.uid) ?? []) ev.relateException(ex);
    const it = ev.iterator();
    for (let n = 0; n < MAX_OCCURRENCES; n++) {
      const next = it.next();
      if (!next) break;
      const d = ev.getOccurrenceDetails(next);
      const startIso = toDate(d.startDate);
      if (startIso.allDay ? startIso.iso > toDay : Date.parse(startIso.iso) >= toMs) break;
      push(d.item, d.startDate, d.endDate, `${ev.uid}:${d.recurrenceId.toString()}`);
    }
  }
  out.sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
  return { name, events: out };
}

export interface CalendarLinkInfo {
  host: string;
  calendarName: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  createdAt: string;
}

type Row = { url_enc: string; host: string; calendar_name_enc: string | null; last_ok_at: Date | string | null; last_error: string | null; created_at: Date | string };

export class CalendarLinkStore {
  private cache = new Map<string, { at: number; text: string }>();

  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async info(userId: string): Promise<CalendarLinkInfo | null> {
    const { rows } = await this.db.query<Row>("SELECT * FROM calendar_links WHERE user_id = $1", [userId]);
    const r = rows[0];
    if (!r) return null;
    return {
      host: r.host,
      calendarName: r.calendar_name_enc ? this.cipher.decrypt(r.calendar_name_enc) : null,
      lastOkAt: r.last_ok_at ? new Date(r.last_ok_at).toISOString() : null,
      lastError: r.last_error,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  /** Check the link really returns a calendar, then save it. */
  async connect(userId: string, raw: unknown, tz: string, now = new Date()): Promise<CalendarLinkInfo & { eventsToday: number }> {
    const url = normaliseCalendarUrl(raw);
    const text = await fetchIcs(url, this.fetchImpl);
    const from = zonedToUtc(localParts(tz, now).date, "00:00", tz);
    const { name, events } = eventsFromIcs(text, from, new Date(from.getTime() + 86400000), tz);
    await this.db.query(
      `INSERT INTO calendar_links (user_id, url_enc, host, calendar_name_enc, last_ok_at, last_error) VALUES ($1,$2,$3,$4,now(),NULL)
       ON CONFLICT (user_id) DO UPDATE SET url_enc = EXCLUDED.url_enc, host = EXCLUDED.host, calendar_name_enc = EXCLUDED.calendar_name_enc, last_ok_at = now(), last_error = NULL, created_at = now()`,
      [userId, this.cipher.encrypt(url.toString()), url.hostname, name ? this.cipher.encrypt(name.slice(0, 200)) : null],
    );
    this.cache.set(userId, { at: Date.now(), text });
    await audit(this.db, { userId, actor: "user", action: "calendar_link.connected", details: { host: url.hostname } });
    return { ...(await this.info(userId))!, eventsToday: events.length };
  }

  async disconnect(userId: string): Promise<void> {
    await this.db.query("DELETE FROM calendar_links WHERE user_id = $1", [userId]);
    this.cache.delete(userId);
    await audit(this.db, { userId, actor: "user", action: "calendar_link.disconnected" });
  }

  async events(userId: string, from: Date, to: Date, tz: string): Promise<CalendarEvent[]> {
    const { rows } = await this.db.query<Row>("SELECT url_enc FROM calendar_links WHERE user_id = $1", [userId]);
    if (!rows[0]) throw new UserFacingError("No calendar link.", "not_connected");
    let text = this.cache.get(userId);
    if (!text || Date.now() - text.at > CACHE_MS) {
      try {
        text = { at: Date.now(), text: await fetchIcs(new URL(this.cipher.decrypt(rows[0].url_enc)), this.fetchImpl) };
        this.cache.set(userId, text);
        await this.db.query("UPDATE calendar_links SET last_ok_at = now(), last_error = NULL WHERE user_id = $1", [userId]);
      } catch (err) {
        await this.db.query("UPDATE calendar_links SET last_error = $1 WHERE user_id = $2", [(err as Error).message.slice(0, 300), userId]);
        throw err;
      }
    }
    return eventsFromIcs(text.text, from, to, tz).events;
  }
}
