import { describe, expect, it } from "vitest";
import { freshDb, seedUser, testCipher, liveProviders } from "./helpers";
import { defaultDeps } from "../src/chat/service";
import { AgendaService, MockCalendarSource } from "../src/integrations/calendar";
import { IntegrationStore } from "../src/integrations/store";
import { MockProvider } from "../src/llm/mock";
import type { ChatEvent, ChatRequest, LLMProvider } from "../src/llm/types";
import { getSettings, updateSettings } from "../src/settings";
import { MissionEngine, nextAutomationRun } from "../src/agent/engine";
import { decide } from "../src/agent/policy";
import { matchIntent, TEMPLATES } from "../src/agent/templates";
import { TOOLS } from "../src/agent/tools";
import { addDays, localParts } from "../src/util/time";

const NOW = new Date("2026-11-05T09:00:00Z"); // Thursday 10:00 in Oslo

async function rig(opts: { calendar?: boolean; provider?: LLMProvider; live?: boolean } = {}) {
  const db = await freshDb();
  const user = await seedUser(db);
  const cipher = testCipher();
  const base = defaultDeps(db, cipher);
  const deps = { ...base, agenda: new AgendaService(opts.calendar === false ? null : new MockCalendarSource(), new IntegrationStore(db, cipher)) };
  const providers = opts.live ? liveProviders(opts.provider) : { primary: new MockProvider({ delayMs: 0 }), mock: new MockProvider({ delayMs: 0 }), mode: "mock" as const };
  const engine = new MissionEngine(db, cipher, providers, deps, null);
  const setMode = (mode: number, extra: Record<string, unknown> = {}) => updateSettings(db, cipher, user.id, { agent: { mode, ...extra } });
  return { db, user, cipher, deps, engine, setMode };
}

describe("autonomy policy", () => {
  const base = { halted: false, autopilotOk: true, autoActionsToday: 0, dailyAutoActions: 20 };
  it("follows the mode table", () => {
    const d = (mode: 1 | 2 | 3 | 4, risk: "read" | "low" | "medium" | "high") => decide({ ...base, mode, risk }).decision;
    expect([d(1, "read"), d(1, "low"), d(1, "medium"), d(1, "high")]).toEqual(["auto", "recommend", "recommend", "recommend"]);
    expect([d(2, "read"), d(2, "low"), d(2, "medium"), d(2, "high")]).toEqual(["auto", "approve", "approve", "approve"]);
    expect([d(3, "read"), d(3, "low"), d(3, "medium"), d(3, "high")]).toEqual(["auto", "auto", "approve", "approve"]);
    expect([d(4, "read"), d(4, "low"), d(4, "medium"), d(4, "high")]).toEqual(["auto", "auto", "auto", "approve"]);
  });
  it("emergency stop blocks even reads; 'off' blocks; overrides never loosen high risk", () => {
    expect(decide({ ...base, mode: 4, risk: "read", halted: true }).decision).toBe("blocked");
    expect(decide({ ...base, mode: 4, risk: "read", override: "off" }).decision).toBe("blocked");
    expect(decide({ ...base, mode: 4, risk: "high", override: "auto" }).decision).toBe("approve");
    expect(decide({ ...base, mode: 4, risk: "low", override: "approve" }).decision).toBe("approve");
    expect(decide({ ...base, mode: 2, risk: "medium", override: "auto" }).decision).toBe("auto");
    expect(decide({ ...base, mode: 1, risk: "low", override: "auto" }).decision).toBe("recommend");
  });
  it("respects Autopilot's per-tool allowance and the daily cap", () => {
    expect(decide({ ...base, mode: 4, risk: "medium", autopilotOk: false }).decision).toBe("approve");
    expect(decide({ ...base, mode: 3, risk: "low", autoActionsToday: 20 }).decision).toBe("approve");
  });
  it("has no tool that sends, pays, books or deletes, and every tool has a known agent and risk", () => {
    for (const t of TOOLS) {
      expect(t.name).not.toMatch(/send|pay|transfer|buy|book|post|delete/);
      expect(["read", "low", "medium", "high"]).toContain(t.risk);
    }
  });
});

describe("intent routing", () => {
  it("maps voice commands to missions and leaves other text to conversation", () => {
    expect(matchIntent("MAVERICK, prepare tomorrow's briefing.")?.template).toBe("prepare_tomorrow");
    expect(matchIntent("Prepare me for tomorrow")?.template).toBe("prepare_tomorrow");
    expect(matchIntent("Run a situation report")?.template).toBe("situation_report");
    expect(matchIntent("analyse my productivity this week")?.template).toBe("weekly_review");
    expect(matchIntent("clear my overdue tasks")?.template).toBe("clear_overdue");
    expect(matchIntent("Research integrated ATPL schools in Norway")).toEqual({ template: "research_brief", params: { question: "integrated ATPL schools in Norway" } });
    expect(matchIntent("How are you today?")).toBeNull();
  });
  it("every template builds a plan of registered tools ending with a report", () => {
    for (const t of TEMPLATES) {
      const plan = t.build({ question: "x y z", subject: "Hi", purpose: "Say hi" });
      expect(plan.steps.at(-1)!.tool).toBe("report.compose");
      for (const s of plan.steps) expect(TOOLS.some((x) => x.name === s.tool)).toBe(true);
    }
  });
});

describe("mission engine: prepare for tomorrow", () => {
  it("Advisory: runs reads, recommends the change, writes a readiness report", async () => {
    const { engine, user, setMode, deps } = await rig();
    await setMode(1);
    const today = localParts("Europe/Oslo", NOW).date;
    await deps.planning.createTask(user.id, { title: "Old thing", dueDate: addDays(today, -2) });
    const m = await engine.create(user, { template: "prepare_tomorrow", source: "user" }, NOW);
    expect(m.status).toBe("running");
    await engine.advanceUser(user.id, NOW);
    const done = (await engine.get(user.id, m.id))!;
    expect(done.status).toBe("completed");
    const byTool = Object.fromEntries(done.steps.map((s) => [s.title, s.status]));
    expect(byTool["Read tomorrow's calendar"]).toBe("done");
    expect(byTool["Evening review reminder"]).toBe("recommended");
    expect(done.report).toContain("Readiness: needs attention");
    expect(done.report).toContain("1 overdue task");
    expect(done.report).toContain("Deep work: client proposal"); // from the (demo) calendar, not invented
    expect((await deps.planning.listTasks(user.id)).map((t) => t.title)).not.toContain("Review tomorrow's plan (10 min)");
  });

  it("Assisted: pauses for approval; approving creates the task with tool confirmation", async () => {
    const { engine, user, setMode, deps } = await rig();
    await setMode(2);
    const m = await engine.create(user, { template: "prepare_tomorrow", source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    let cur = (await engine.get(user.id, m.id))!;
    expect(cur.status).toBe("awaiting_approval");
    const waiting = await engine.approvals(user.id);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.preview).toContain('Create task "Review tomorrow\'s plan (10 min)"');
    expect((await engine.status(user.id, NOW)).core).toBe("alert");

    await engine.approve(user, waiting[0]!.id);
    await engine.advanceUser(user.id, NOW);
    cur = (await engine.get(user.id, m.id))!;
    expect(cur.status).toBe("completed");
    const task = (await deps.planning.listTasks(user.id)).find((t) => t.title === "Review tomorrow's plan (10 min)");
    expect(task?.source).toBe("agent");
    expect(task?.missionId).toBe(m.id);
    expect(task?.remindAt).toBeTruthy();
    const events = await engine.events(user.id, { missionId: m.id });
    expect(events.some((e) => e.kind === "step.done" && e.message.includes("Confirmed: task"))).toBe(true);
    expect(cur.report).toContain("Readiness: ready");
  });

  it("Autonomous: makes the low-risk change on its own and counts it against the daily limit", async () => {
    const { engine, user, setMode, deps } = await rig();
    await setMode(3);
    const m = await engine.create(user, { template: "prepare_tomorrow", source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    expect((await engine.get(user.id, m.id))!.status).toBe("completed");
    expect((await deps.planning.listTasks(user.id)).some((t) => t.source === "agent")).toBe(true);
    expect((await engine.status(user.id, NOW)).autoActionsToday).toBe(1);

    await setMode(3, { dailyAutoActions: 1 });
    const m2 = await engine.create(user, { template: "prepare_tomorrow", source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    expect((await engine.get(user.id, m2.id))!.status).toBe("awaiting_approval");
  });

  it("a mission can run at a lower mode than the global one, never higher", async () => {
    const { engine, user, setMode } = await rig();
    await setMode(2);
    const high = await engine.create(user, { template: "prepare_tomorrow", source: "user", mode: 4 }, NOW);
    expect(high.mode).toBe(2);
    await setMode(4);
    const low = await engine.create(user, { template: "prepare_tomorrow", source: "user", mode: 1 }, NOW);
    await engine.advanceUser(user.id, NOW);
    expect((await engine.get(user.id, low.id))!.steps.find((s) => s.tool === "tasks.create")!.status).toBe("recommended");
  });
});

describe("mission engine: approvals, bulk changes, controls", () => {
  it("medium-risk bulk change needs approval in Autonomous, runs in Autopilot only if the tool allows it", async () => {
    const { engine, user, setMode, deps } = await rig();
    const today = localParts("Europe/Oslo", NOW).date;
    await deps.planning.createTask(user.id, { title: "Late A", dueDate: addDays(today, -3) });
    await deps.planning.createTask(user.id, { title: "Late B", dueDate: addDays(today, -1) });
    await setMode(4);
    const m = await engine.create(user, { template: "clear_overdue", source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    // tasks.reschedule_overdue is not autopilot-allowed: waits even in mode 4
    expect((await engine.get(user.id, m.id))!.status).toBe("awaiting_approval");
    const [step] = await engine.approvals(user.id);
    await engine.reject(user, step!.id);
    await engine.advanceUser(user.id, NOW);
    const after = (await engine.get(user.id, m.id))!;
    expect(after.status).toBe("completed");
    expect(after.steps.find((s) => s.tool === "tasks.reschedule_overdue")!.status).toBe("skipped");
    expect((await deps.planning.listTasks(user.id)).every((t) => t.dueDate! < today)).toBe(true);
    expect(after.report).toContain("Not executed");

    // Oliver explicitly allows the tool: now it runs and confirms each change.
    await setMode(4, { toolOverrides: { "tasks.reschedule_overdue": "auto" } });
    const m2 = await engine.create(user, { template: "clear_overdue", source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    expect((await engine.get(user.id, m2.id))!.status).toBe("completed");
    expect((await deps.planning.listTasks(user.id)).every((t) => t.dueDate === today)).toBe(true);
  });

  it("a tool switched off is skipped and can't be approved", async () => {
    const { engine, user, setMode } = await rig();
    await setMode(3, { toolOverrides: { "tasks.create": "off" } });
    const m = await engine.create(user, { template: "prepare_tomorrow", source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    const s = (await engine.get(user.id, m.id))!.steps.find((x) => x.tool === "tasks.create")!;
    expect(s.status).toBe("skipped");
    expect(s.decisionReason).toContain("switched off");
  });

  it("emergency stop halts execution and automations until resumed", async () => {
    const { engine, user, setMode, db, cipher } = await rig();
    await setMode(3);
    await engine.setHalted(user, true);
    const m = await engine.create(user, { template: "situation_report", source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    let cur = (await engine.get(user.id, m.id))!;
    expect(cur.steps.every((s) => s.status === "pending")).toBe(true);
    expect((await engine.status(user.id, NOW)).core).toBe("alert");
    await engine.createAutomation(user, { template: "situation_report", cadence: "daily", time: "09:30" });
    expect(await engine.runAutomations(user, NOW)).toEqual([]);

    await engine.setHalted(user, false);
    expect((await getSettings(db, cipher, user.id)).agent.halted).toBe(false);
    await engine.advanceUser(user.id, NOW);
    cur = (await engine.get(user.id, m.id))!;
    expect(cur.status).toBe("completed");
    expect(cur.report).toContain("Systems check");
    expect(cur.report).toContain("No financial data yet"); // honest, not invented
  });

  it("recovers a step interrupted by a restart and retries it", async () => {
    const { engine, user, setMode, db, deps, cipher } = await rig();
    await setMode(3);
    const m = await engine.create(user, { template: "situation_report", source: "user" }, NOW);
    // Simulate a crash mid-step: step left "running" with an old start time.
    await db.query("UPDATE mission_steps SET status = 'running', attempts = 1, started_at = $1 WHERE mission_id = $2 AND idx = 0", [new Date(NOW.getTime() - 10 * 60_000).toISOString(), m.id]);
    const restarted = new MissionEngine(db, cipher, { primary: new MockProvider({ delayMs: 0 }), mock: new MockProvider({ delayMs: 0 }), mode: "mock" }, deps, null);
    expect(await restarted.recoverStale(NOW)).toBe(1);
    await restarted.advanceUser(user.id, NOW);
    const cur = (await restarted.get(user.id, m.id))!;
    expect(cur.status).toBe("completed");
    expect(cur.steps[0]!.attempts).toBe(2);
    expect((await restarted.events(user.id, { missionId: m.id })).some((e) => e.kind === "step.recovered")).toBe(true);
  });

  it("proposed missions wait for launch; cancel stops a mission", async () => {
    const { engine, user, setMode } = await rig();
    await setMode(2);
    const p = await engine.create(user, { template: "weekly_review", source: "user", propose: true }, NOW);
    expect(p.status).toBe("proposed");
    await engine.advanceUser(user.id, NOW);
    expect((await engine.get(user.id, p.id))!.steps.every((s) => s.status === "pending")).toBe(true);
    await engine.launch(user, p.id);
    await engine.advanceUser(user.id, NOW);
    expect((await engine.get(user.id, p.id))!.status).toBe("completed");

    const c = await engine.create(user, { template: "prepare_tomorrow", source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    const cancelled = await engine.cancel(user, c.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.steps.find((s) => s.tool === "tasks.create")!.status).toBe("skipped");
  });

  it("is honest when the calendar isn't connected", async () => {
    const { engine, user, setMode } = await rig({ calendar: false });
    await setMode(1);
    const m = await engine.create(user, { template: "prepare_tomorrow", source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    const r = (await engine.get(user.id, m.id))!.report!;
    expect(r).toContain("Calendar unavailable");
    expect(r).toContain("calendar not available");
  });

  it("skips web research in mock mode instead of pretending", async () => {
    const { engine, user, setMode } = await rig();
    await setMode(4);
    const m = await engine.create(user, { template: "research_brief", params: { question: "Best ATPL schools" }, source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    const s = (await engine.get(user.id, m.id))!.steps.find((x) => x.tool === "research.web")!;
    expect(s.status).toBe("skipped");
    expect(s.error).toContain("live AI model");
  });

  it("drafts an email with a template in mock mode and never sends it", async () => {
    const { engine, user, setMode } = await rig();
    await setMode(3);
    const m = await engine.create(user, { template: "draft_email", params: { subject: "Follow-up", purpose: "thank them for the call", to: "client@example.com" }, source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    const drafts = await engine.drafts.list(user.id);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.status).toBe("draft");
    expect(drafts[0]!.writtenBy).toBe("template");
    expect((await engine.get(user.id, m.id))!.report).toContain("Not sent");
  });
});

describe("LLM planner and live writing", () => {
  /** A scripted model: plans via submit_plan, then writes short text. */
  class PlannerModel implements LLMProvider {
    readonly id = "anthropic";
    calls: ChatRequest[] = [];
    constructor(private readonly plan: unknown) {}
    isConfigured() {
      return true;
    }
    async *stream(req: ChatRequest): AsyncIterable<ChatEvent> {
      this.calls.push(req);
      const submit = req.tools?.find((t) => t.name === "submit_plan");
      if (submit) {
        await submit.run(this.plan as Record<string, unknown>);
        yield { type: "tool", name: "submit_plan", ok: true };
      } else {
        if (req.webSearch) yield { type: "source", url: "https://example.org/a", title: "Example source" };
        yield { type: "text", text: "Focus on the statistics exam first." };
      }
      yield { type: "done", stopReason: "end_turn", servedBy: req.model, usage: { inputTokens: 500, outputTokens: 50 } };
    }
  }

  it("uses a valid model plan, validates every input, and appends the report", async () => {
    const model = new PlannerModel({
      title: "Exam readiness",
      steps: [
        { tool: "memory.recall", title: "What I know about the exam", input_json: '{"query":"statistics exam"}' },
        { tool: "tasks.create", title: "Revision block", input_json: '{"title":"Statistics revision","dueDate":"tomorrow","priority":1,"remindAt":"08:00"}' },
      ],
    });
    const { engine, user, setMode } = await rig({ live: true, provider: model });
    await setMode(3);
    const m = await engine.create(user, { objective: "Get me ready for the statistics exam", source: "user" }, NOW);
    expect(m.planner).toBe("model");
    expect(m.steps.map((s) => s.tool)).toEqual(["memory.recall", "tasks.create", "report.compose"]);
    await engine.advanceUser(user.id, NOW);
    const done = (await engine.get(user.id, m.id))!;
    expect(done.status).toBe("completed");
    expect(done.report).toContain("Focus on the statistics exam first.");
    expect(done.costUsd).toBeGreaterThan(0);
  });

  it("rejects a plan with a bad input and falls back to a safe template plan", async () => {
    const model = new PlannerModel({ title: "x", steps: [{ tool: "tasks.create", title: "bad", input_json: '{"title":""}' }] });
    const { engine, user } = await rig({ live: true, provider: model });
    const m = await engine.create(user, { objective: "Do something vague", source: "user" }, NOW);
    expect(m.planner).toMatch(/^template/);
    expect(m.steps.every((s) => s.risk === "read")).toBe(true);
  });

  it("web research returns sources and records the search fee", async () => {
    const model = new PlannerModel({});
    const { engine, user, setMode } = await rig({ live: true, provider: model });
    await setMode(4);
    const m = await engine.create(user, { template: "research_brief", params: { question: "ATPL cost in Norway" }, source: "user" }, NOW);
    await engine.advanceUser(user.id, NOW);
    const done = (await engine.get(user.id, m.id))!;
    const s = done.steps.find((x) => x.tool === "research.web")!;
    expect(s.status).toBe("done");
    expect(s.output).toContain("https://example.org/a");
    expect(model.calls.some((c) => c.webSearch?.maxUses === 5)).toBe(true);
    expect(done.costUsd).toBeGreaterThanOrEqual(0.05);
  });
});

describe("automations", () => {
  it("fires once per local day inside the window and computes the next run", async () => {
    const { engine, user, setMode, db, cipher } = await rig();
    await setMode(2);
    const a = await engine.createAutomation(user, { template: "situation_report", cadence: "weekdays", time: "09:30" });
    expect(await engine.runAutomations(user, new Date("2026-11-05T08:00:00Z"))).toEqual([]); // 09:00 Oslo, too early
    const fired = await engine.runAutomations(user, NOW); // 10:00 Oslo
    expect(fired).toHaveLength(1);
    expect(await engine.runAutomations(user, new Date(NOW.getTime() + 60_000))).toEqual([]);
    const m = (await engine.get(user.id, fired[0]!))!;
    expect(m.source).toBe("automation");
    const settings = await getSettings(db, cipher, user.id);
    const autos = await engine.listAutomations(user.id);
    expect(nextAutomationRun(autos, settings, NOW)).toBe("2026-11-06T08:30:00.000Z"); // Friday 09:30 Oslo
    await engine.updateAutomation(user, a.id, { enabled: false });
    expect((await engine.status(user.id, NOW)).automations.enabled).toBe(0);
    // Saturday: weekdays automations don't fire
    await engine.updateAutomation(user, a.id, { enabled: true });
    expect(await engine.runAutomations(user, new Date("2026-11-07T09:00:00Z"))).toEqual([]);
  });
});
