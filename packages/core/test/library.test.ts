import { describe, expect, it } from "vitest";
import { freshDb, seedUser, testCipher } from "./helpers";
import { defaultDeps } from "../src/chat/service";
import { AgendaService, type CalendarSource } from "../src/integrations/calendar";
import { IntegrationStore } from "../src/integrations/store";
import { MockProvider } from "../src/llm/mock";
import { getSettings, updateSettings } from "../src/settings";
import { MissionEngine } from "../src/agent/engine";
import { LIBRARY, TaskLibrary } from "../src/library";
import { BriefingService } from "../src/briefing";
import { Scheduler } from "../src/scheduler";
import { queueNotice } from "../src/notify";
import { zonedToUtc } from "../src/util/time";

const TZ = "Europe/Oslo";
const at = (date: string, hhmm: string) => zonedToUtc(date, hhmm, TZ);
const FRI = at("2026-11-06", "05:00");

class ShiftCalendar implements CalendarSource {
  readonly id = "test";
  constructor(private readonly hours: number) {}
  async listEvents(_u: string, from: Date) {
    const start = new Date(from.getTime() + 6 * 3600000);
    return [{ id: "s", title: "Shift", start: start.toISOString(), end: new Date(start.getTime() + this.hours * 3600000).toISOString(), allDay: false, location: null, calendar: "Work" }];
  }
}

async function rig(opts: { shiftHours?: number } = {}) {
  const db = await freshDb();
  const user = await seedUser(db);
  const cipher = testCipher();
  const base = defaultDeps(db, cipher);
  const deps = { ...base, agenda: new AgendaService(opts.shiftHours ? new ShiftCalendar(opts.shiftHours) : null, new IntegrationStore(db, cipher)) };
  const providers = { primary: new MockProvider({ delayMs: 0 }), mock: new MockProvider({ delayMs: 0 }), mode: "mock" as const };
  const engine = new MissionEngine(db, cipher, providers, deps, null);
  const library = new TaskLibrary(db, deps, engine.finance, engine.health);
  const settings = () => getSettings(db, cipher, user.id);
  return { db, cipher, user, deps, engine, library, settings, providers };
}

describe("library data", () => {
  it("has all 232 researched tasks, unique ids, and links that point at real tasks", () => {
    expect(LIBRARY).toHaveLength(232);
    const ids = new Set(LIBRARY.map((t) => t.id));
    expect(ids.size).toBe(232);
    for (const t of LIBRARY) {
      for (const r of t.requires ?? []) expect(ids.has(r), `${t.id} requires ${r}`).toBe(true);
      if (t.trigger.type === "after") expect(ids.has(t.trigger.id)).toBe(true);
      expect(["S", "M", "L"]).toContain(t.effort);
      expect(t.title.length).toBeGreaterThan(5);
    }
    // Every domain has tasks.
    expect(new Set(LIBRARY.map((t) => t.domain)).size).toBe(7);
  });
});

describe("daily library run", () => {
  it("suggests at most 3, at most one per area, with the urgent exam and funding tasks first", async () => {
    const { user, library, settings, deps } = await rig();
    const picked = await library.run(user, await settings(), FRI);
    expect(picked.length).toBe(3);
    expect(new Set(picked.map((t) => t.domain)).size).toBe(3);
    const ids = picked.map((t) => t.id);
    expect(ids.some((id) => id.startsWith("E"))).toBe(true); // exam in 14 days
    expect(ids).toContain("A1"); // consultation closes 23 Nov
    const inbox = (await deps.suggestions.list(user.id, "pending")).filter((s) => s.source === "library");
    expect(inbox).toHaveLength(3);
    const exam = inbox.find((s) => s.sourceRef!.startsWith("E"))!;
    expect(exam.body).toMatch(/Why now: 14 days until your exam \(2026-11-20\)/);
    expect(exam.payload).toMatchObject({ kind: "task", priority: 1 });
    // A second run the same day adds nothing.
    expect(await library.run(user, await settings(), at("2026-11-06", "15:00"))).toEqual([]);
  });

  it("learns: accept unlocks next steps, 'not now' rests 14 days, 'never' stops it", async () => {
    const { user, library, settings, deps } = await rig();
    const s0 = await settings();
    const pick = async (id: string) => library.suggestNow(user, s0, id, FRI);
    const find = async (id: string) => (await deps.suggestions.list(user.id, "pending")).find((s) => s.sourceRef === id)!;

    expect((await library.candidates(user, s0, FRI)).some((c) => c.task.id === "Z2")).toBe(false); // locked behind Z1
    await pick("Z1");
    await deps.suggestions.accept(user.id, (await find("Z1")).id);
    const after = await library.candidates(user, s0, FRI);
    expect(after.some((c) => c.task.id === "Z2")).toBe(true);
    expect(after.some((c) => c.task.id === "Z1")).toBe(false); // one-off, done

    await pick("M1");
    await deps.suggestions.dismiss(user.id, (await find("M1")).id, "not_now");
    expect((await library.candidates(user, s0, at("2026-11-10", "05:00"))).some((c) => c.task.id === "M1")).toBe(false);
    expect((await library.candidates(user, s0, at("2026-12-01", "05:00"))).some((c) => c.task.id === "M1")).toBe(true);

    await pick("D33");
    await deps.suggestions.dismiss(user.id, (await find("D33")).id, "never");
    expect((await library.candidates(user, s0, at("2027-06-01", "05:00"))).some((c) => c.task.id === "D33")).toBe(false);
    const view = await library.overview(user, s0, FRI);
    expect(view.items.find((i) => i.id === "D33")!.status).toBe("never");
    expect(view.items.find((i) => i.id === "Z1")!.status).toBe("accepted");
    expect(view.stats.zorza).toEqual({ accepted: 1, answered: 1 });
    expect(view.stats.money).toEqual({ accepted: 0, answered: 1 });
  });

  it("keeps big tasks off shift days", async () => {
    const { user, library, settings } = await rig({ shiftHours: 8 });
    const picked = await library.run(user, await settings(), FRI);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((t) => t.effort !== "L")).toBe(true);
  });

  it("weekly tasks appear on their day and once per week; anchors follow Settings", async () => {
    const { user, library, settings, db, cipher } = await rig();
    const s0 = await settings();
    const sun = await library.candidates(user, s0, at("2026-11-08", "05:00"));
    expect(sun.some((c) => c.task.id === "D8")).toBe(true); // weekly review, Sunday
    const wed = await library.candidates(user, s0, at("2026-11-11", "05:00"));
    expect(wed.some((c) => c.task.id === "D8")).toBe(false);
    // Clearing the exam date removes exam tasks; setting the next exam brings its plan 6 weeks out.
    await updateSettings(db, cipher, user.id, { library: { anchors: { exam: "", exam2: "2027-01-15" } } });
    const s1 = await settings();
    const c = await library.candidates(user, s1, at("2026-12-10", "05:00"));
    expect(c.some((x) => x.task.id.startsWith("E") && x.task.id !== "E14")).toBe(false);
    expect(c.some((x) => x.task.id === "E14")).toBe(true);
  });

  it("data conditions fire from real data only", async () => {
    const { user, library, settings, deps } = await rig();
    const s0 = await settings();
    expect((await library.candidates(user, s0, FRI)).some((c) => c.task.id === "D6")).toBe(false);
    await deps.planning.createTask(user.id, { title: "Send the invoice", dueDate: "2026-11-02" });
    const c = (await library.candidates(user, s0, FRI)).find((x) => x.task.id === "D6")!;
    expect(c.reason).toContain("Send the invoice");
  });
});

describe("daily jobs, batching and the briefing", () => {
  it("prepares overnight, picks library tasks, batches notices into the 15:00 digest, and opens the briefing with it all", async () => {
    const { db, cipher, user, deps, engine, library, providers } = await rig();
    await updateSettings(db, cipher, user.id, { notifications: { enabled: true } });
    const sent: { kind: string; title: string; body: string }[] = [];
    const notifier = { notify: async (_u: string, _s: unknown, msg: { kind: string; title: string; body: string }) => (sent.push(msg), { status: "sent", delivered: 1 }) };
    const briefings = new BriefingService(db, cipher, providers, deps, notifier as never);
    briefings.setPreparation(async (_u, date) => {
      const start = at(date, "00:00").getTime();
      const prep = (await engine.list(user.id)).find((m) => m.template === "overnight_prep" && Date.parse(m.createdAt) >= start);
      const picks = (await deps.suggestions.list(user.id, "pending")).filter((s) => s.source === "library").map((s) => s.title);
      return { missionId: prep?.status === "completed" ? prep.id : null, excerpt: prep?.report ?? null, suggestions: picks };
    });
    const scheduler = new Scheduler(db, cipher, deps, briefings, notifier as never, engine, library);
    const settings = await getSettings(db, cipher, user.id);

    // 04:30: overnight preparation (read-only), once.
    expect((await scheduler.dailyJobs(user, settings, at("2026-11-06", "04:30"))).overnight).toBe(true);
    expect((await scheduler.dailyJobs(user, settings, at("2026-11-06", "04:31"))).overnight).toBe(false);
    await engine.advanceUser(user.id, at("2026-11-06", "04:31"));
    const prep = (await engine.list(user.id))[0]!;
    expect(prep.template).toBe("overnight_prep");
    expect(prep.status).toBe("completed");
    expect(prep.steps.every((s) => s.risk === "read")).toBe(true);

    // 05:00: library picks.
    expect((await scheduler.dailyJobs(user, settings, at("2026-11-06", "05:00"))).library).toBe(3);

    // An approval during the day is queued, not pushed.
    await queueNotice(db, cipher, user.id, { kind: "approval", title: "Approval needed", body: "Create task", url: "/missions/x" });
    expect(sent).toHaveLength(0);

    // 05:30 briefing opens with the preparation and the picks, and carries nothing from the queue yet... the queue drains here.
    const r = await briefings.run(user, "morning", { now: at("2026-11-06", "05:30") });
    const conv = await db.query<{ content_enc: string }>("SELECT content_enc FROM messages WHERE conversation_id = $1", [r.conversationId]);
    const text = cipher.decrypt(conv.rows[0]!.content_enc);
    expect(text).toContain("Here's what I prepared overnight");
    expect(text).toContain(`/missions/${prep.id}`);
    expect(text).toContain("Suggested for today");
    expect(sent.at(-1)!.body).toContain("Also: 1 approval waiting");

    // Something new after the briefing waits for the 15:00 digest.
    await queueNotice(db, cipher, user.id, { kind: "mission", title: "Mission complete", body: "Mission \"Weekly review\" completed: 7 done.", url: "/missions/y" });
    expect((await scheduler.dailyJobs(user, settings, at("2026-11-06", "14:59"))).digest).toBe(0);
    expect((await scheduler.dailyJobs(user, settings, at("2026-11-06", "15:00"))).digest).toBe(1);
    expect(sent.at(-1)).toMatchObject({ kind: "digest", title: "Maverick: 1 update" });
    expect((await scheduler.dailyJobs(user, settings, at("2026-11-06", "15:30"))).digest).toBe(0);
  });

  it("the engine queues approval notices instead of pushing them", async () => {
    const { db, cipher, user, engine } = await rig();
    await updateSettings(db, cipher, user.id, { agent: { mode: 2 } });
    await engine.create(user, { template: "prepare_tomorrow", source: "user" }, FRI);
    await engine.advanceUser(user.id, FRI);
    const { rows } = await db.query<{ kind: string }>("SELECT kind FROM notification_queue WHERE user_id = $1", [user.id]);
    expect(rows.map((r) => r.kind)).toEqual(["approval"]);
  });
});
