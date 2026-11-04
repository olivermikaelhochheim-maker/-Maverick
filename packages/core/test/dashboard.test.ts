import { describe, expect, it } from "vitest";
import { defaultDeps } from "../src/chat/service";
import { computeDashboard } from "../src/dashboard";
import { getSettings } from "../src/settings";
import { AgendaService, MockCalendarSource } from "../src/integrations/calendar";
import { IntegrationStore } from "../src/integrations/store";
import { freshDb, seedUser, testCipher } from "./helpers";

// Wednesday 4 Nov 2026, 11:00 Oslo
const NOW = new Date("2026-11-04T10:00:00Z");

async function world() {
  const db = await freshDb();
  const user = await seedUser(db);
  const cipher = testCipher();
  const deps = { ...defaultDeps(db, cipher), agenda: new AgendaService(new MockCalendarSource(), new IntegrationStore(db, cipher)) };
  const settings = { ...(await getSettings(db, cipher, user.id)), timezone: "Europe/Oslo" };
  return { db, user, cipher, deps, settings };
}

describe("dashboard", () => {
  it("computes trends, streak, goal progress, next event and insights from real data", async () => {
    const { db, user, cipher, deps, settings } = await world();
    const goal = await deps.planning.createGoal(user.id, { title: "Finish BI degree", targetDate: "2026-11-25" });
    const exam = await deps.planning.createTask(user.id, { title: "Statistics exam", priority: 1, dueDate: "2026-11-06", goalId: goal.id });
    await deps.planning.createTask(user.id, { title: "Old thing", dueDate: "2026-10-20" });
    // Finished tasks on each of the last 3 days (morning), and 1 the week before.
    for (const [day, hour] of [["2026-11-01", "08"], ["2026-11-02", "09"], ["2026-11-03", "07"], ["2026-10-26", "10"]]) {
      const t = await deps.planning.createTask(user.id, { title: `Done ${day}`, goalId: goal.id });
      await db.query("UPDATE tasks SET status = 'done', completed_at = $1 WHERE id = $2", [`${day}T${hour}:00:00Z`, t.id]);
    }
    await db.query("INSERT INTO focus_sessions (id, user_id, planned_minutes, started_at, ended_at, completed) VALUES ('f1', $1, 25, '2026-11-03T08:00:00Z', '2026-11-03T08:25:00Z', true)", [user.id]);
    await deps.memory.create(user.id, { category: "profile", content: "x", source: "user" });

    const d = await computeDashboard(db, cipher, deps, user, settings, NOW);
    expect(d.today).toBe("2026-11-04");
    expect(d.tasksDone7).toMatchObject({ value: 3, previous: 1 });
    expect(d.tasksDone7.series).toHaveLength(14);
    expect(d.focus7.value).toBe(25);
    expect(d.streak).toMatchObject({ current: 3, activeToday: false });
    expect(d.tasks).toMatchObject({ open: 2, overdue: 1, dueThisWeek: 1 });
    expect(d.goals[0]).toMatchObject({ title: "Finish BI degree", done: 4, total: 5, open: 1, daysLeft: 21 });
    expect(d.nextEvent).toMatchObject({ title: "Call with prospective client", minutesUntil: 120 });
    expect(d.memories).toBe(1);

    const kinds = d.insights.map((i) => i.kind);
    expect(kinds[0]).toBe("critical"); // overdue first
    expect(d.insights[0]!.text).toContain("Old thing");
    expect(d.insights.some((i) => i.text.includes("“Statistics exam” is in 2 days"))).toBe(true);
    expect(d.insights.some((i) => i.kind === "win" && i.text.includes("3-day streak"))).toBe(true);
    expect(d.prompts[0]).toContain("Call with prospective client");
    void exam;
  });

  it("works for a brand-new account", async () => {
    const { db, user, cipher, deps, settings } = await world();
    const d = await computeDashboard(db, cipher, deps, user, settings, NOW);
    expect(d.streak.current).toBe(0);
    expect(d.insights.some((i) => i.text.includes("No goals recorded yet"))).toBe(true);
    expect(d.prompts.length).toBeGreaterThan(0);
  });

  it("focus sessions: one at a time, auto-closed when time runs out", async () => {
    const { user, deps } = await world();
    const s = await deps.focus.start(user.id, { minutes: 25 }, NOW);
    expect(s.plannedMinutes).toBe(25);
    await expect(deps.focus.start(user.id, { minutes: 25 }, NOW)).rejects.toMatchObject({ code: "already_running" });
    expect(await deps.focus.active(user.id, new Date(NOW.getTime() + 26 * 60000))).toBeNull(); // settled
    const stats = await deps.focus.sessionsSince(user.id, new Date(NOW.getTime() - 1000), new Date(NOW.getTime() + 60 * 60000));
    expect(stats[0]).toMatchObject({ minutes: 25, completed: true });
    await deps.focus.start(user.id, { minutes: 50 }, new Date(NOW.getTime() + 30 * 60000));
    const stopped = await deps.focus.stop(user.id, false, new Date(NOW.getTime() + 40 * 60000));
    expect(stopped).toMatchObject({ completed: false });
  });
});
