import { describe, expect, it } from "vitest";
import { defaultDeps } from "../src/chat/service";
import { AgendaService } from "../src/integrations/calendar";
import { IntegrationStore } from "../src/integrations/store";
import { Notifier } from "../src/notify";
import { BriefingService } from "../src/briefing";
import { Scheduler } from "../src/scheduler";
import { updateSettings, getSettings } from "../src/settings";
import { snapshot, renderState } from "../src/context";
import { exportAll } from "../src/export";
import { importAll } from "../src/import";
import { LifeStore, isoWeekNumber, mondayOf, scoreDay, scoreWeek, type LogBook, type ScoredHabit } from "../src/life";
import { freshDb, liveProviders, seedUser, testCipher } from "./helpers";

// ---------- Pure scoring ----------

const habits: ScoredHabit[] = [
  // Mon/Wed/Fri until 2 Nov, then every day: the edit must not rewrite week 44.
  {
    id: "a",
    area: "fitness",
    versions: [
      { validFrom: "2026-10-01", kind: "days", days: [1, 3, 5], target: 0, status: "active" },
      { validFrom: "2026-11-02", kind: "days", days: [1, 2, 3, 4, 5, 6, 7], target: 0, status: "active" },
    ],
  },
  { id: "b", area: "career", versions: [{ validFrom: "2026-10-01", kind: "weekly", days: [], target: 3, status: "active" }] },
  { id: "c", area: "sleep", versions: [{ validFrom: "2026-10-28", kind: "days", days: [1, 2, 3, 4, 5, 6, 7], target: 0, status: "active" }] },
];
const book: LogBook = {
  logs: {
    a: { "2026-10-26": "done", "2026-10-28": "missed" },
    b: { "2026-10-26": "done", "2026-10-27": "done", "2026-10-28": "done", "2026-10-29": "done", "2026-10-30": "done" },
    c: { "2026-10-28": "done", "2026-10-29": "sick" },
  },
  flags: { "2026-10-31": "rest" },
};

describe("habit scoring", () => {
  it("scores a final week with history, capped weekly targets, excused days and not-logged kept apart from missed", () => {
    const w = scoreWeek(habits, book, "2026-10-26", "2026-11-02");
    expect(w.status).toBe("final");
    const a = w.habits.find((h) => h.habitId === "a")!;
    expect([a.scheduled, a.done, a.missed, a.unlogged]).toEqual([3, 1, 1, 1]); // old Mon/Wed/Fri schedule kept
    const b = w.habits.find((h) => h.habitId === "b")!;
    expect([b.scheduled, b.done, b.extra, b.pct]).toEqual([3, 3, 2, 100]); // 5 done, counted up to 3
    const c = w.habits.find((h) => h.habitId === "c")!;
    expect([c.scheduled, c.done, c.unlogged, c.excused]).toEqual([3, 1, 2, 2]); // ill Thu, rest-day Sat
    expect(w.total).toMatchObject({ scheduled: 9, done: 5, missed: 1, unlogged: 3, excused: 2, pct: 56 });
    expect(w.byArea.career).toMatchObject({ done: 3, scheduled: 3, pct: 100 });
  });

  it("counts the week so far through today, with weekly targets still open", () => {
    const w = scoreWeek(habits, { logs: {}, flags: {} }, "2026-11-02", "2026-11-03");
    expect(w.status).toBe("current");
    expect(w.total).toMatchObject({ scheduled: 7, done: 0, unlogged: 4, short: 3, pct: 0 });
  });

  it("shows nothing scheduled as null, never 0%", () => {
    expect(scoreDay([], { logs: {}, flags: {} }, "2026-11-02").pct).toBeNull();
    expect(scoreWeek([], { logs: {}, flags: {} }, "2026-11-02", "2026-11-04").total.pct).toBeNull();
  });

  it("excuses a weekly target's session with rest or illness", () => {
    const h: ScoredHabit[] = [{ id: "g", area: "fitness", versions: [{ validFrom: "2026-01-01", kind: "weekly", days: [], target: 3, status: "active" }] }];
    const w = scoreWeek(h, { logs: { g: { "2026-11-02": "done", "2026-11-04": "sick" } }, flags: {} }, "2026-11-02", "2026-11-09");
    expect(w.total).toMatchObject({ scheduled: 2, done: 1, short: 1, excused: 1, pct: 50 });
  });

  it("handles ISO weeks", () => {
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
    expect(isoWeekNumber("2026-11-02")).toBe(45);
    expect(isoWeekNumber("2027-01-01")).toBe(53);
  });
});

// ---------- Store, briefings, reminders, import/export ----------

async function world() {
  const db = await freshDb();
  const user = await seedUser(db);
  const cipher = testCipher();
  const deps = { ...defaultDeps(db, cipher), agenda: new AgendaService(null, new IntegrationStore(db, cipher)) };
  const sent: string[] = [];
  const notifier = new Notifier(db, cipher, { publicKey: "pk", privateKey: "sk", subject: "mailto:t@example.com" }, async (_s, payload) => {
    sent.push(payload);
    return { statusCode: 201 };
  });
  const providers = { ...liveProviders(), mode: "mock" as const };
  const briefings = new BriefingService(db, cipher, providers, deps, notifier);
  const scheduler = new Scheduler(db, cipher, deps, briefings, notifier);
  return { db, user, cipher, deps, life: deps.life!, notifier, briefings, scheduler, sent };
}

describe("Life store", () => {
  it("keeps schedule history when a habit is edited, and pause applies from a date", async () => {
    const w = await world();
    const h = await w.life.createHabit(w.user.id, { title: "Walk 20 minutes", area: "fitness", kind: "days", days: [1, 3, 5], from: "2026-10-01", minimum: "Around the block" });
    await w.life.setLog(w.user.id, h.id, "2026-10-26", "done", "2026-11-04");
    await w.life.updateHabit(w.user.id, h.id, { schedule: { kind: "days", days: [1, 2, 3, 4, 5, 6, 7], from: "2026-11-02" } });
    const old = await w.life.week(w.user.id, "2026-10-26", "2026-11-04");
    expect(old.score.total).toMatchObject({ scheduled: 3, done: 1 });
    const cur = await w.life.week(w.user.id, "2026-11-02", "2026-11-04");
    expect(cur.score.total.scheduled).toBe(3); // Mon–Wed so far, daily

    await w.life.updateHabit(w.user.id, h.id, { status: { value: "paused", from: "2026-11-04" } });
    const paused = await w.life.week(w.user.id, "2026-11-02", "2026-11-04");
    expect(paused.score.total.scheduled).toBe(2); // Wednesday dropped out, Mon/Tue kept
    expect((await w.life.week(w.user.id, "2026-10-26", "2026-11-04")).score.total).toMatchObject({ scheduled: 3, done: 1 });
  });

  it("refuses future logs, clears logs back to not-logged, and validates input", async () => {
    const w = await world();
    const h = await w.life.createHabit(w.user.id, { title: "Read", area: "learning", kind: "weekly", target: 3, from: "2026-11-02" });
    await expect(w.life.setLog(w.user.id, h.id, "2026-11-05", "done", "2026-11-04")).rejects.toThrow(/hasn't happened/);
    await w.life.setLog(w.user.id, h.id, "2026-11-04", "done", "2026-11-04");
    await w.life.setLog(w.user.id, h.id, "2026-11-04", null, "2026-11-04");
    expect((await w.life.logBook(w.user.id, "2026-11-01", "2026-11-30")).logs[h.id]).toBeUndefined();
    await expect(w.life.createHabit(w.user.id, { title: "X", area: "fitness", kind: "days", days: [], from: "2026-11-02" })).rejects.toThrow(/at least one day/);
    await expect(w.life.createHabit(w.user.id, { title: "X", area: "nope", kind: "weekly", target: 2, from: "2026-11-02" })).rejects.toThrow(/life area/);
    const other = await w.life.createHabit(w.user.id, { title: "Y", area: "fitness", kind: "weekly", target: 2, from: "2026-11-02" });
    await expect(w.life.setLog("someone-else", other.id, "2026-11-03", "done", "2026-11-04")).rejects.toThrow(/not found/);
  });

  it("encrypts journal entries at rest and searches after decrypting", async () => {
    const w = await world();
    const e = await w.life.createEntry(w.user.id, { date: "2026-11-03", body: "Long ramp shift, legs heavy", mood: 3, prompts: { well: "Walked home anyway" } }, "2026-11-04");
    const raw = await w.db.query<{ data_enc: string }>("SELECT data_enc FROM journal_entries WHERE id = $1", [e.id]);
    expect(raw.rows[0]!.data_enc).not.toMatch(/ramp|legs|Walked|mood/);
    expect(await w.life.listEntries(w.user.id, { q: "walked HOME" })).toHaveLength(1);
    expect(await w.life.listEntries(w.user.id, { q: "flight" })).toHaveLength(0);
    const u = await w.life.updateEntry(w.user.id, e.id, { energy: 2, prompts: { well: "" } }, "2026-11-04");
    expect(u).toMatchObject({ mood: 3, energy: 2, prompts: {} });
    await expect(w.life.createEntry(w.user.id, { date: "2026-11-09", body: "x" }, "2026-11-04")).rejects.toThrow(/future/);
    await expect(w.life.updateEntry(w.user.id, e.id, { mood: 9 }, "2026-11-04")).rejects.toThrow(/1 to 5/);
  });

  it("puts habits in Maverick's context, and only journal entries Oliver allowed", async () => {
    const w = await world();
    const now = new Date("2026-11-04T17:00:00Z"); // 18:00 Oslo, Wednesday
    const h = await w.life.createHabit(w.user.id, { title: "Screens off before bed", area: "sleep", kind: "days", days: [1, 2, 3, 4, 5, 6, 7], from: "2026-11-02" });
    await w.life.setLog(w.user.id, h.id, "2026-11-02", "done", "2026-11-04");
    await w.life.createEntry(w.user.id, { date: "2026-11-04", body: "Shared thought about the exam", mood: 4 }, "2026-11-04");
    await w.life.createEntry(w.user.id, { date: "2026-11-04", body: "Private detail", mood: 1, aiAllowed: false }, "2026-11-04");
    const settings = await getSettings(w.db, w.cipher, w.user.id);
    const text = renderState(await snapshot(w.deps, w.user.id, settings, now), settings.timezone);
    expect(text).toContain("Screens off before bed: not logged yet");
    expect(text).toContain("1 of 3 done");
    expect(text).toContain("mood 4");
    expect(text).not.toContain("mood 1");
    expect(text).not.toContain("Shared thought"); // chat context carries no journal text
    const evening = await w.life.renderForModel(w.user.id, "2026-11-04", { journalDays: 1 });
    expect(evening).toContain("Shared thought");
    expect(evening).not.toContain("Private detail");
  });

  it("adds habits to template briefings", async () => {
    const w = await world();
    await w.life.createHabit(w.user.id, { title: "Study statistics", area: "learning", kind: "days", days: [1, 2, 3, 4, 5], from: "2026-11-02" });
    const r = await w.briefings.run(w.user, "evening", { now: new Date("2026-11-04T20:00:00Z"), notify: false });
    const { rows } = await w.db.query<{ content_enc: string }>("SELECT content_enc FROM messages WHERE conversation_id = $1", [r.conversationId]);
    const content = w.cipher.decrypt(rows[0]!.content_enc);
    expect(content).toContain("**Habits not logged yet**");
    expect(content).toContain("- Study statistics");
  });

  it("sends a habit reminder once per day, only while due and not logged, and holds it in quiet hours", async () => {
    const w = await world();
    await w.notifier.subscribe(w.user.id, { endpoint: "https://web.push.apple.com/x", keys: { p256dh: "k", auth: "a" } });
    await updateSettings(w.db, w.cipher, w.user.id, { notifications: { enabled: true }, proactive: { morningBriefing: false, eveningCheckIn: false, weeklyReview: false } });
    const h = await w.life.createHabit(w.user.id, { title: "Creatine", area: "health", kind: "days", days: [1, 2, 3, 4, 5, 6, 7], from: "2026-11-02", remindTime: "08:00", minimum: "3 g" });
    expect((await w.scheduler.tick(new Date("2026-11-04T06:30:00Z"))).reminders).toBe(0); // 07:30 Oslo, not yet
    expect((await w.scheduler.tick(new Date("2026-11-04T07:01:00Z"))).reminders).toBe(1); // 08:01
    expect(w.sent.at(-1)).toContain("Creatine. Minimum counts: 3 g");
    expect((await w.scheduler.tick(new Date("2026-11-04T07:02:00Z"))).reminders).toBe(0); // once per day
    await w.life.setLog(w.user.id, h.id, "2026-11-05", "done", "2026-11-05");
    expect((await w.scheduler.tick(new Date("2026-11-05T07:01:00Z"))).reminders).toBe(0); // already logged
    await w.life.updateHabit(w.user.id, h.id, { remindTime: "22:30" });
    expect((await w.scheduler.tick(new Date("2026-11-06T21:31:00Z"))).reminders).toBe(0); // 22:31 is quiet hours
  });

  it("exports Life with everything else and restores it into a fresh Maverick", async () => {
    const a = await world();
    const goal = await a.deps.planning.createGoal(a.user.id, { title: "Run a 10K", horizon: "1y" });
    const h = await a.life.createHabit(a.user.id, { title: "Run", area: "fitness", kind: "weekly", target: 2, from: "2026-10-01", goalId: goal.id, remindTime: "17:00" });
    await a.life.setLog(a.user.id, h.id, "2026-11-02", "done", "2026-11-04");
    await a.life.setDayFlag(a.user.id, "2026-11-03", "sick", "2026-11-04");
    await a.life.createEntry(a.user.id, { date: "2026-11-03", body: "Fever", mood: 2, aiAllowed: false }, "2026-11-04");
    const file = JSON.parse(JSON.stringify(await exportAll(a.db, a.cipher, a.deps, { id: a.user.id, email: "o@x", displayName: "Oliver" })));

    const b = await world();
    const counts = await importAll(b.db, b.cipher, b.user.id, file);
    expect(counts).toMatchObject({ goals: 1, habits: 1, habitLogs: 1, journal: 1 });
    const [hb] = await b.life.listHabits(b.user.id);
    expect(hb).toMatchObject({ title: "Run", remindTime: "17:00", versions: [expect.objectContaining({ kind: "weekly", target: 2 })] });
    expect(hb!.goalId).toBe((await b.deps.planning.listGoals(b.user.id))[0]!.id);
    expect((await b.life.logBook(b.user.id, "2026-11-01", "2026-11-30")).flags["2026-11-03"]).toBe("sick");
    expect((await b.life.listEntries(b.user.id))[0]).toMatchObject({ body: "Fever", mood: 2, aiAllowed: false });
  });

  it("imports a Daybook export: habits with history, logs, rest days, journal and reviewed profile lines", async () => {
    const w = await world();
    const daybook = {
      exportedAt: "2026-11-04T08:00:00Z",
      profile: {
        items: [
          { field: "priorities", text: "Pass the statistics exam on 20 November", kind: "stated", status: "active" },
          { field: "obstacles", text: "You may drop plans when shifts change", kind: "interpretation", status: "pending" },
          { field: "coaching", text: "Direct but warm feedback", kind: "interpretation", status: "confirmed" },
          { field: "strengths", text: "Rejected reading", kind: "interpretation", status: "rejected" },
        ],
      },
      habits: [
        {
          id: "x1",
          title: "Strength session",
          area: "fitness",
          minimum: "10 minutes",
          goal: "Get stronger",
          createdAt: 1761900000000,
          versions: [
            { from: "2026-10-27", kind: "weekly", days: [], target: 2, status: "active" },
            { from: "2026-11-04", kind: "weekly", days: [], target: 2, status: "paused" },
          ],
        },
        { id: "x2", title: "", area: "fitness", versions: [{ from: "2026-10-27", kind: "days", days: [1], status: "active" }] },
      ],
      logs: { "2026-10-26": { h: { x1: { "2026-10-27": "done", "2026-10-29": "done" } }, day: { "2026-11-01": "rest" } } },
      journal: [{ id: "j", date: "2026-11-01", body: "Good day", prompts: { proud: "Finished the essay" }, mood: 4, sleepQ: 3, sleepH: 7.5, ai: false, createdAt: 1761990000000 }],
    };
    const r = await w.life.importAll(w.user.id, daybook);
    expect(r).toEqual({ habits: 1, logs: 2, dayFlags: 1, journal: 1, profile: 2 });
    const [h] = await w.life.listHabits(w.user.id);
    expect(h!.versions.map((v) => v.status)).toEqual(["active", "paused"]);
    expect(h!.why).toBe("Goal: Get stronger");
    expect((await w.life.week(w.user.id, "2026-10-26", "2026-11-04")).score.total).toMatchObject({ done: 2, scheduled: 2 });
    const [e] = await w.life.listEntries(w.user.id);
    expect(e).toMatchObject({ prompts: { proud: "Finished the essay" }, sleepQuality: 3, sleepHours: 7.5, aiAllowed: false });
    const mems = await w.deps.memory.list(w.user.id);
    expect(mems.map((m) => m.content).sort()).toEqual(["Direct but warm feedback", "Pass the statistics exam on 20 November"]);
    await expect(w.life.importAll(w.user.id, daybook)).rejects.toThrow(/no habits or journal/);
    await expect(w.life.importAll(w.user.id, { hello: 1 })).rejects.toThrow(/isn't a Daybook or Maverick export/);
  });
});
