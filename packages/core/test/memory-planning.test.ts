import { describe, expect, it } from "vitest";
import { MemoryStore, keywordMap, keywords } from "../src/memory";
import { PlanningStore } from "../src/planning";
import { SuggestionStore } from "../src/suggestions";
import { proposalTools } from "../src/llm/tools";
import { freshDb, seedUser, testCipher } from "./helpers";

async function stores() {
  const db = await freshDb();
  const user = await seedUser(db);
  const cipher = testCipher();
  const memory = new MemoryStore(db, cipher);
  const planning = new PlanningStore(db, cipher);
  const suggestions = new SuggestionStore(db, cipher, memory, planning);
  return { db, user, memory, planning, suggestions };
}

describe("memory vault", () => {
  it("creates, edits, deletes and encrypts memories with provenance", async () => {
    const { db, user, memory } = await stores();
    const m = await memory.create(user.id, { category: "preference", content: "Prefers deep work before noon", source: "user" });
    expect(m).toMatchObject({ source: "user", confidence: 1, retention: "permanent", expiresAt: null });
    const raw = await db.query<{ content_enc: string }>("SELECT content_enc FROM memories");
    expect(raw.rows[0]!.content_enc).not.toContain("deep work");

    const edited = await memory.update(user.id, m.id, { content: "Prefers deep work before 11:00" });
    expect(edited.content).toBe("Prefers deep work before 11:00");
    await memory.delete(user.id, m.id);
    expect(await memory.list(user.id)).toHaveLength(0);
  });

  it("an edit by Oliver raises an inferred memory to full confidence", async () => {
    const { user, memory } = await stores();
    const m = await memory.create(user.id, { category: "profile", content: "Seems to train in the evenings", source: "conversation", confidence: 0.6 });
    expect((await memory.update(user.id, m.id, { content: "Trains at 17:30 on weekdays" })).confidence).toBe(1);
  });

  it("short-term context expires and is purged", async () => {
    const { db, user, memory } = await stores();
    const m = await memory.create(user.id, { category: "ephemeral", content: "Travelling to Bergen this week", source: "user" });
    expect(m.retention).toBe("7d");
    expect(m.expiresAt).not.toBeNull();
    await db.query("UPDATE memories SET expires_at = now() - interval '1 minute'");
    expect(await memory.list(user.id)).toHaveLength(0);
    expect(await memory.purgeExpired()).toBe(1);
  });

  it("selects always-on memories and keyword matches, each with a reason", async () => {
    const { user, memory } = await stores();
    await memory.create(user.id, { category: "goal", content: "Grow Zorza revenue to 100k NOK per month", source: "user" });
    await memory.create(user.id, { category: "decision", content: "Decided to stop offering hourly billing", source: "user" });
    await memory.create(user.id, { category: "episodic", content: "Had a great climbing session in Oslo", source: "user" });
    const sel = await memory.selectForPrompt(user.id, "Should I change billing for my retainer clients?");
    const reasons = Object.fromEntries(sel.map((s) => [s.memory.category, s.reason]));
    expect(reasons.goal).toMatch(/Always included/);
    expect(reasons.decision).toMatch(/Matches: .*billing/);
    expect(reasons.episodic).toBeUndefined();
  });

  it("respects the token budget", async () => {
    const { user, memory } = await stores();
    for (let i = 0; i < 20; i++) await memory.create(user.id, { category: "profile", content: `Fact number ${i} `.repeat(30), source: "user" });
    const sel = await memory.selectForPrompt(user.id, "hi", 400);
    expect(sel.length).toBeLessThan(20);
    expect(sel.length).toBeGreaterThan(0);
  });

  it("keyword extraction ignores stop words and short words", () => {
    expect([...keywordMap("What should I do about the pricing of retainers?").values()]).toEqual(["pricing", "retainers"]);
    expect(keywords("billing").has([...keywords("bills")][0]!)).toBe(false); // short words aren't stemmed
    expect([...keywords("billing")]).toEqual([...keywords("billed")]);
    expect(keywords("the and for you")).toEqual(new Set());
  });
});

describe("goals and tasks", () => {
  it("ranks open tasks by due date then priority, and completes them", async () => {
    const { user, planning } = await stores();
    const goal = await planning.createGoal(user.id, { title: "Pilot's licence", horizon: "personal", metric: "PPL checkride passed" });
    await planning.createTask(user.id, { title: "Low priority, no date", priority: 3 });
    const urgent = await planning.createTask(user.id, { title: "Book medical exam", priority: 1, dueDate: "2026-11-01", goalId: goal.id });
    await planning.createTask(user.id, { title: "Later", priority: 1, dueDate: "2026-12-01" });
    const open = await planning.listTasks(user.id);
    expect(open.map((t) => t.title)).toEqual(["Book medical exam", "Later", "Low priority, no date"]);
    expect(open[0]!.goalId).toBe(goal.id);
    const done = await planning.updateTask(user.id, urgent.id, { status: "done" });
    expect(done.completedAt).not.toBeNull();
    expect(await planning.completedSince(user.id, new Date(Date.now() - 60_000))).toHaveLength(1);
  });

  it("validates input", async () => {
    const { user, planning } = await stores();
    await expect(planning.createTask(user.id, { title: "" })).rejects.toThrow(/required/);
    await expect(planning.createTask(user.id, { title: "x", priority: 7 })).rejects.toThrow(/Priority/);
    await expect(planning.createTask(user.id, { title: "x", dueDate: "tomorrow" })).rejects.toThrow(/date like/);
    await expect(planning.createTask(user.id, { title: "x", goalId: "nope" })).rejects.toThrow(/goal not found/);
  });

  it("finds reminders that are due, once", async () => {
    const { user, planning } = await stores();
    const t = await planning.createTask(user.id, { title: "Call the flight school", remindAt: new Date(Date.now() - 1000).toISOString() });
    expect((await planning.dueReminders()).map((x) => x.id)).toEqual([t.id]);
    await planning.markReminded(t.id);
    expect(await planning.dueReminders()).toHaveLength(0);
  });
});

describe("suggestion inbox", () => {
  it("nothing takes effect until Oliver accepts", async () => {
    const { user, memory, planning, suggestions } = await stores();
    const s = (await suggestions.propose(user.id, { kind: "memory", category: "preference", content: "Prefers morning workouts", confidence: 0.8 }, { source: "conversation" }))!;
    expect(await memory.list(user.id)).toHaveLength(0);
    await suggestions.accept(user.id, s.id);
    const [m] = await memory.list(user.id);
    expect(m).toMatchObject({ content: "Prefers morning workouts", source: "conversation", confidence: 0.8 });

    const a = (await suggestions.propose(user.id, { kind: "action", title: "Prepare three questions for the client call", why: "First calls convert better with a clear agenda." }, { source: "briefing" }))!;
    await suggestions.accept(user.id, a.id, { title: "Prepare 3 questions for Thursday's call" });
    const [task] = await planning.listTasks(user.id);
    expect(task).toMatchObject({ title: "Prepare 3 questions for Thursday's call", source: "suggestion" });
  });

  it("dismissing leaves no trace in memory or tasks, and can't be accepted later", async () => {
    const { user, memory, suggestions } = await stores();
    const s = (await suggestions.propose(user.id, { kind: "memory", category: "profile", content: "Dislikes mornings", confidence: 0.4 }, { source: "conversation" }))!;
    await suggestions.dismiss(user.id, s.id);
    expect(await memory.list(user.id)).toHaveLength(0);
    await expect(suggestions.accept(user.id, s.id)).rejects.toMatchObject({ code: "not_pending" });
  });

  it("ignores duplicates and caps the number of pending items", async () => {
    const { user, suggestions } = await stores();
    const p = { kind: "task" as const, title: "Draft proposal", notes: null, priority: 2 as const, dueDate: null };
    expect(await suggestions.propose(user.id, p, { source: "conversation" })).not.toBeNull();
    expect(await suggestions.propose(user.id, { ...p, title: "draft PROPOSAL" }, { source: "conversation" })).toBeNull();
    for (let i = 0; i < 35; i++) await suggestions.propose(user.id, { ...p, title: `Task ${i}` }, { source: "conversation" });
    expect((await suggestions.list(user.id, "pending")).length).toBe(30);
  });

  it("proposal tools validate model input and limit proposals per reply", async () => {
    const { user, suggestions } = await stores();
    const seen: string[] = [];
    const tools = proposalTools(suggestions, { userId: user.id, source: "conversation", onProposed: (s) => seen.push(s.title) });
    const task = tools.find((t) => t.name === "propose_task")!;
    const memoryTool = tools.find((t) => t.name === "propose_memory")!;
    expect((await memoryTool.run({ category: "nonsense", content: "x", confidence: 1, reason: null })).ok).toBe(false);
    for (let i = 0; i < 6; i++) await task.run({ title: `T${i}`, notes: null, priority: 2, dueDate: null, reason: null });
    expect(seen).toHaveLength(5);
    expect((await task.run({ title: "T9", notes: null, priority: 2, dueDate: null, reason: null })).content).toMatch(/Limit reached/);
  });

  it("tool schemas are strict-mode compatible", () => {
    const tools = proposalTools({} as SuggestionStore, { userId: "u", source: "conversation" });
    for (const t of tools) {
      const schema = t.inputSchema as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
      expect(schema.additionalProperties).toBe(false);
      expect(new Set(schema.required)).toEqual(new Set(Object.keys(schema.properties)));
    }
  });
});

describe("paste many memories at once", () => {
  it("cleans lines, skips blanks/fences/headings and duplicates, saves the rest in one go", async () => {
    const { db, user, memory } = await stores();
    await memory.create(user.id, { category: "profile", content: "Oliver lives in Stavanger, Norway.", source: "user" });
    const text = [
      "```",
      "## Profile facts",
      "Oliver lives in Stavanger, Norway",
      "- Oliver speaks Polish, Norwegian, German and English.",
      "",
      "2. Oliver has two dogs, Luna and Grace.",
      "• oliver has two dogs, luna and grace.",
      '"Oliver works at Widerøe."',
      "```",
    ].join("\r\n");
    const res = await memory.createMany(user.id, { category: "profile", text });
    expect(res.added.map((m) => m.content)).toEqual([
      "Oliver speaks Polish, Norwegian, German and English.",
      "Oliver has two dogs, Luna and Grace.",
      "Oliver works at Widerøe.",
    ]);
    expect(res.added.every((m) => m.source === "user" && m.confidence === 1 && m.category === "profile")).toBe(true);
    expect(res.skipped.map((s) => s.reason)).toEqual(["Already in the vault", "Already in the vault"]);
    expect(await memory.list(user.id)).toHaveLength(4);
    const audits = await db.query<{ action: string }>("SELECT action FROM audit_log WHERE action = 'memory.bulk_created'");
    expect(audits.rows).toHaveLength(1);
  });

  it("uses the category's default retention unless one is given", async () => {
    const { user, memory } = await stores();
    const a = await memory.createMany(user.id, { category: "ephemeral", text: "Travelling to Bergen this week" });
    expect(a.added[0]).toMatchObject({ retention: "7d" });
    const b = await memory.createMany(user.id, { category: "project", text: "Statistics exam on 20 November", retention: "permanent" });
    expect(b.added[0]).toMatchObject({ retention: "permanent", expiresAt: null });
  });

  it("is all-or-nothing on invalid input", async () => {
    const { user, memory } = await stores();
    await expect(memory.createMany(user.id, { category: "profile", text: "ok line\n" + "x".repeat(2001) })).rejects.toThrow(/Line 2 is too long/);
    await expect(memory.createMany(user.id, { category: "profile", text: "\n\n```\n" })).rejects.toThrow(/Nothing to add/);
    await expect(memory.createMany(user.id, { category: "profile", text: Array.from({ length: 101 }, (_, i) => `fact ${i}`).join("\n") })).rejects.toThrow(/at most 100/);
    await expect(memory.createMany(user.id, { category: "nonsense" as never, text: "a" })).rejects.toThrow(/category/);
    expect(await memory.list(user.id)).toHaveLength(0);
  });
});

describe("browser preview parser", () => {
  it("matches the server's line parser exactly", async () => {
    const { parseMemoryLines: server } = await import("../src/memory");
    const { parseMemoryLines: browser } = await import("../../../apps/web/lib/memory-lines");
    const samples = [
      "```\n## Heading\n- a\n* b\n• c\n– d\n1. e\n12) f\n\n\"g\"\n“h”\n```",
      "plain\r\nwindows\r\n",
      "   indented   \n#not a heading\n# real heading",
    ];
    for (const s of samples) expect(browser(s)).toEqual(server(s));
  });
});
