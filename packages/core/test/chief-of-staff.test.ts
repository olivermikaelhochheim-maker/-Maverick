import { describe, expect, it } from "vitest";
import { ChatService, defaultDeps, SYSTEM_OPENED_TURN, type ChatStreamEvent } from "../src/chat/service";
import { MockProvider } from "../src/llm/mock";
import type { ChatRequest, LLMProvider } from "../src/llm/types";
import { updateSettings, getSettings } from "../src/settings";
import { AgendaService, MockCalendarSource, renderAgenda } from "../src/integrations/calendar";
import { IntegrationStore } from "../src/integrations/store";
import { GoogleCalendarSource, buildAuthUrl, exchangeCode, pkcePair } from "../src/integrations/google";
import { Notifier, validateSubscription } from "../src/notify";
import { BriefingService } from "../src/briefing";
import { Scheduler, dueBriefings } from "../src/scheduler";
import { exportAll } from "../src/export";
import { collect, freshDb, liveProviders, seedUser, testCipher } from "./helpers";

async function world(primary: LLMProvider = new MockProvider({ delayMs: 0 }), opts: { mode?: "live" | "mock"; calendar?: boolean } = {}) {
  const db = await freshDb();
  const user = await seedUser(db);
  const cipher = testCipher();
  const base = defaultDeps(db, cipher);
  const integrations = new IntegrationStore(db, cipher);
  const deps = { ...base, agenda: new AgendaService(opts.calendar === false ? null : new MockCalendarSource(), integrations) };
  const providers = opts.mode === "mock" ? { primary, mock: primary, mode: "mock" as const } : liveProviders(primary);
  const sent: { payload: string }[] = [];
  const notifier = new Notifier(db, cipher, { publicKey: "pk", privateKey: "sk", subject: "mailto:t@example.com" }, async (_s, payload) => {
    sent.push({ payload });
    return { statusCode: 201 };
  });
  const chat = new ChatService(db, cipher, providers, deps);
  const briefings = new BriefingService(db, cipher, providers, deps, notifier);
  const scheduler = new Scheduler(db, cipher, deps, briefings, notifier);
  return { db, user, cipher, deps, chat, notifier, briefings, scheduler, sent, integrations };
}

/** Behaves like Claude calling a proposal tool, then finishing its reply. */
class ToolUsingProvider implements LLMProvider {
  readonly id = "tooly";
  requests: ChatRequest[] = [];
  async *stream(req: ChatRequest) {
    this.requests.push(req);
    yield { type: "text" as const, text: "Good idea." };
    const tool = req.tools!.find((t) => t.name === "propose_task")!;
    const r = await tool.run({ title: "Book the flight medical", notes: null, priority: 1, dueDate: null, reason: "Needed before solo flight" });
    yield { type: "tool" as const, name: tool.name, ok: r.ok };
    yield { type: "text" as const, text: "It's in your inbox." };
    yield { type: "done" as const, stopReason: "end_turn", servedBy: req.model, usage: { inputTokens: 3000, outputTokens: 200 } };
  }
  isConfigured() {
    return true;
  }
}

describe("chat as chief of staff", () => {
  it("proposals from tools reach the inbox and the stream, but nothing is saved as a task", async () => {
    const p = new ToolUsingProvider();
    const w = await world(p);
    const events = await collect(w.chat.send({ user: w.user, text: "I want to start flight training" }));
    const sug = events.filter((e) => e.type === "suggestion");
    expect(sug).toEqual([expect.objectContaining({ kind: "task", title: "Book the flight medical" })]);
    expect(await w.deps.planning.listTasks(w.user.id)).toHaveLength(0);
    expect(await w.deps.suggestions.list(w.user.id)).toHaveLength(1);
    const text = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
    expect(text).toBe("Good idea.\n\nIt's in your inbox.");
  });

  it("gives the model approved memories, goals, tasks and today's calendar, and records why each memory was used", async () => {
    const p = new ToolUsingProvider();
    const w = await world(p);
    const m = await w.deps.memory.create(w.user.id, { category: "goal", content: "Earn a private pilot licence", source: "user" });
    await w.deps.planning.createTask(w.user.id, { title: "Call flight school", priority: 1 });
    const events = await collect(w.chat.send({ user: w.user, text: "What should I focus on?" }));
    const meta = events[0] as Extract<ChatStreamEvent, { type: "meta" }>;
    expect(meta.context).toEqual([expect.objectContaining({ id: m.id, reason: expect.stringMatching(/Always included/) })]);
    const ctx = p.requests[0]!.turnContext!;
    expect(ctx).toContain("Earn a private pilot licence");
    expect(ctx).toContain("Call flight school");
    expect(ctx).toContain("Deep work: client proposal");
    expect(ctx).toContain("<calendar_data>");
    const done = events.at(-1) as Extract<ChatStreamEvent, { type: "done" }>;
    expect(await w.deps.memory.contextFor(w.user.id, done.assistantMessageId)).toEqual([expect.objectContaining({ id: m.id })]);
  });

  it("asks for a spoken style only when Oliver used his voice", async () => {
    const p = new ToolUsingProvider();
    const w = await world(p);
    await collect(w.chat.send({ user: w.user, text: "typed question" }));
    await collect(w.chat.send({ user: w.user, text: "spoken question", voice: true }));
    expect(p.requests[0]!.turnContext).not.toContain("by voice");
    expect(p.requests[1]!.turnContext).toContain("talking to you by voice");
  });

  it("can switch proposals off", async () => {
    const p = new ToolUsingProvider();
    const w = await world(new MockProvider({ delayMs: 0 }));
    await updateSettings(w.db, w.cipher, w.user.id, { proactive: { suggestFromChat: false } });
    const spy: ChatRequest[] = [];
    const chat = new ChatService(w.db, w.cipher, liveProviders({ id: "s", isConfigured: () => true, async *stream(r) { spy.push(r); yield { type: "done", stopReason: "end_turn", servedBy: r.model, usage: { inputTokens: 1, outputTokens: 1 } }; } }), w.deps);
    await collect(chat.send({ user: w.user, text: "hello" }));
    expect(spy[0]!.tools).toEqual([]);
    void p;
  });

  it("mock mode files a 'remember' request as a suggestion", async () => {
    const w = await world(new MockProvider({ delayMs: 0 }), { mode: "mock" });
    const events = await collect(w.chat.send({ user: w.user, text: "Remember that I train at 17:30 on weekdays" }));
    expect(events.some((e) => e.type === "suggestion")).toBe(true);
    const [s] = await w.deps.suggestions.list(w.user.id);
    expect(s!.payload).toMatchObject({ kind: "memory", content: "I train at 17:30 on weekdays" });
  });

  it("replying to a briefing conversation starts the history with a labelled stand-in user turn", async () => {
    const spy: ChatRequest[] = [];
    const provider: LLMProvider = { id: "s", isConfigured: () => true, async *stream(r) { spy.push(r); yield { type: "text", text: "ok" }; yield { type: "done", stopReason: "end_turn", servedBy: r.model, usage: { inputTokens: 1, outputTokens: 1 } }; } };
    const w = await world(provider, { mode: "mock" });
    const res = await w.briefings.run(w.user, "morning", { force: true });
    await collect(w.chat.send({ user: w.user, conversationId: res.conversationId, text: "The proposal matters most" }));
    expect(spy[0]!.messages[0]).toEqual({ role: "user", content: SYSTEM_OPENED_TURN });
    expect(spy[0]!.messages[1]!.role).toBe("assistant");
  });
});

describe("calendar", () => {
  it("reports honestly when no calendar is connected", async () => {
    const w = await world(undefined, { calendar: false });
    const agenda = await w.deps.agenda.forDay(w.user.id, "Europe/Oslo", "2026-10-26");
    expect(agenda.status).toBe("not_configured");
    expect(renderAgenda(agenda, "Europe/Oslo")).toMatch(/not connected \(don't guess/);
  });

  it("Google: builds a PKCE auth URL with read-only scope", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThan(40);
    const url = new URL(buildAuthUrl({ clientId: "cid", clientSecret: "s", redirectUri: "http://localhost:3000/cb" }, "st", challenge));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("calendar.readonly");
    expect(url.searchParams.get("scope")).not.toMatch(/calendar(\s|$)|calendar.events(\s|$)/);
    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("Google: refuses a sign-in where calendar access wasn't granted", async () => {
    const fake = async () => Response.json({ access_token: "a", expires_in: 3600, scope: "openid email" });
    await expect(exchangeCode({ clientId: "c", clientSecret: "s", redirectUri: "r" }, "code", "v", fake as typeof fetch)).rejects.toThrow(/Calendar access wasn't granted/);
  });

  it("Google: refreshes expired tokens, reads selected calendars, skips declined events", async () => {
    const w = await world();
    await w.integrations.save(w.user.id, "google", {
      tokens: { accessToken: "old", refreshToken: "refresh-1", expiresAt: Date.now() - 1000 },
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      accountEmail: "oliver@gmail.com",
    });
    const calls: string[] = [];
    const fake = async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u.split("?")[0]} ${init?.headers ? JSON.stringify(init.headers) : ""}`);
      if (u.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "new", expires_in: 3600 });
      if (u.includes("calendarList")) return Response.json({ items: [{ id: "primary", summary: "Oliver", selected: true }, { id: "hidden", selected: false }] });
      return Response.json({
        items: [
          { id: "1", summary: "Client call", start: { dateTime: "2026-10-26T09:00:00+01:00" }, end: { dateTime: "2026-10-26T09:30:00+01:00" } },
          { id: "2", summary: "Declined thing", start: { dateTime: "2026-10-26T10:00:00+01:00" }, end: { dateTime: "2026-10-26T11:00:00+01:00" }, attendees: [{ self: true, responseStatus: "declined" }] },
        ],
      });
    };
    const source = new GoogleCalendarSource(w.integrations, { clientId: "c", clientSecret: "s", redirectUri: "r" }, fake as typeof fetch);
    const events = await source.listEvents(w.user.id, new Date("2026-10-26T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));
    expect(events.map((e) => e.title)).toEqual(["Client call"]);
    expect(calls.filter((c) => c.includes("/events")).length).toBe(1); // unselected calendar skipped
    expect(calls.some((c) => c.includes('"Authorization":"Bearer new"'))).toBe(true);
    expect((await w.integrations.tokens(w.user.id, "google"))!.refreshToken).toBe("refresh-1");
    // Tokens are encrypted at rest.
    const raw = await w.db.query<{ tokens_enc: string }>("SELECT tokens_enc FROM integrations");
    expect(raw.rows[0]!.tokens_enc).not.toContain("refresh-1");
  });

  it("Google: a revoked refresh token marks the connection as needing reconnect", async () => {
    const w = await world();
    await w.integrations.save(w.user.id, "google", { tokens: { accessToken: "x", refreshToken: "r", expiresAt: 0 }, scopes: [], accountEmail: null });
    const fake = async () => Response.json({ error: "invalid_grant" }, { status: 400 });
    const agenda = new AgendaService(new GoogleCalendarSource(w.integrations, { clientId: "c", clientSecret: "s", redirectUri: "r" }, fake as typeof fetch), w.integrations);
    expect((await agenda.forDay(w.user.id, "Europe/Oslo", "2026-10-26")).status).toBe("needs_reauth");
    expect((await w.integrations.get(w.user.id, "google"))!.status).toBe("needs_reauth");
  });
});

describe("notifications", () => {
  const appleSub = { endpoint: "https://web.push.apple.com/abc", keys: { p256dh: "k", auth: "a" } };

  it("only accepts real push services (no arbitrary URLs)", () => {
    expect(validateSubscription(appleSub).endpoint).toContain("web.push.apple.com");
    expect(() => validateSubscription({ ...appleSub, endpoint: "https://evil.example/x" })).toThrow(/not recognised/);
    expect(() => validateSubscription({ ...appleSub, endpoint: "http://web.push.apple.com/x" })).toThrow();
    expect(() => validateSubscription({ endpoint: "https://fcm.googleapis.com/x" })).toThrow(/Invalid/);
  });

  it("requires consent, respects quiet hours and the daily cap", async () => {
    const w = await world();
    await w.notifier.subscribe(w.user.id, appleSub);
    let s = await getSettings(w.db, w.cipher, w.user.id);
    const msg = { kind: "test" as const, title: "t", body: "b", url: "/" };
    const noon = new Date("2026-10-26T11:00:00Z"); // 12:00 Oslo
    expect((await w.notifier.notify(w.user.id, s, msg, noon)).reason).toBe("disabled");
    s = await updateSettings(w.db, w.cipher, w.user.id, { notifications: { enabled: true, maxPerDay: 2 } });
    expect((await w.notifier.notify(w.user.id, s, msg, new Date("2026-10-26T22:30:00Z"))).reason).toBe("quiet_hours"); // 23:30 Oslo
    expect((await w.notifier.notify(w.user.id, s, msg, noon)).status).toBe("sent");
    expect((await w.notifier.notify(w.user.id, s, msg, noon)).status).toBe("sent");
    expect((await w.notifier.notify(w.user.id, s, msg, noon)).reason).toBe("daily_limit");
    expect(w.sent).toHaveLength(2);
  });

  it("drops subscriptions the push service says are gone", async () => {
    const w = await world();
    const n = new Notifier(w.db, w.cipher, { publicKey: "p", privateKey: "k", subject: "mailto:x@y.z" }, async () => {
      throw Object.assign(new Error("gone"), { statusCode: 410 });
    });
    await n.subscribe(w.user.id, appleSub);
    const s = await updateSettings(w.db, w.cipher, w.user.id, { notifications: { enabled: true } });
    expect((await n.notify(w.user.id, s, { kind: "test", title: "t", body: "b", url: "/" }, new Date("2026-10-26T11:00:00Z"))).status).toBe("failed");
    expect(await n.deviceCount(w.user.id)).toBe(0);
  });
});

describe("briefings and scheduler", () => {
  it("decides what's due at Oslo time, with catch-up after the Mac wakes", async () => {
    const w = await world();
    const s = await getSettings(w.db, w.cipher, w.user.id);
    const at = (iso: string) => dueBriefings(s, new Date(iso));
    expect(at("2026-10-26T04:29:00Z")).toEqual([]); // 05:29 Oslo (CET)
    expect(at("2026-10-26T04:30:00Z")).toEqual(["morning"]); // 05:30
    expect(at("2026-10-26T09:00:00Z")).toEqual(["morning"]); // 10:00, catch-up
    expect(at("2026-10-26T11:00:00Z")).toEqual([]); // 12:00, too late
    expect(at("2026-10-26T20:15:00Z")).toEqual(["evening"]); // 21:15
    expect(at("2026-10-25T17:30:00Z")).toEqual(["weekly"]); // Sunday 18:30
  });

  it("template briefing (no model) uses the real calendar and tasks and asks the key question", async () => {
    const w = await world(new MockProvider({ delayMs: 0 }), { mode: "mock" });
    await w.deps.planning.createTask(w.user.id, { title: "Send Q4 proposal", priority: 1, dueDate: "2026-10-20" });
    const res = await w.briefings.run(w.user, "morning", { now: new Date("2026-10-26T04:30:00Z") });
    expect(res).toMatchObject({ status: "done", mode: "template" });
    const [msg] = await w.chat.conversations.messages(w.user.id, res.conversationId!);
    expect(msg!.content).toContain("Deep work: client proposal");
    expect(msg!.content).toContain("Send Q4 proposal (due 2026-10-20, overdue)");
    expect(msg!.content).toContain("Which single outcome matters most today?");
  });

  it("model briefing: proposals land in the inbox and cost is metered", async () => {
    const p = new ToolUsingProvider();
    const w = await world(p);
    const res = await w.briefings.run(w.user, "morning", { now: new Date("2026-10-26T04:30:00Z") });
    expect(res.mode).toBe("model");
    expect(p.requests[0]!.messages[0]!.content).toMatch(/Scheduled morning briefing/);
    expect(await w.deps.suggestions.list(w.user.id)).toEqual([expect.objectContaining({ source: "briefing" })]);
    expect((await w.db.query("SELECT * FROM usage_events")).rows).toHaveLength(1);
  });

  it("falls back to the free template when the budget is spent", async () => {
    const p = new ToolUsingProvider();
    const w = await world(p);
    await updateSettings(w.db, w.cipher, w.user.id, { budget: { monthlySoftUsd: 0, monthlyHardUsd: 0, dailyHardUsd: 0 } });
    const res = await w.briefings.run(w.user, "morning", { now: new Date("2026-10-26T04:30:00Z") });
    expect(res.mode).toBe("template");
    expect(p.requests).toHaveLength(0);
  });

  it("scheduler runs each briefing once per day and notifies", async () => {
    const w = await world(new MockProvider({ delayMs: 0 }), { mode: "mock" });
    await w.notifier.subscribe(w.user.id, { endpoint: "https://web.push.apple.com/x", keys: { p256dh: "k", auth: "a" } });
    await updateSettings(w.db, w.cipher, w.user.id, { notifications: { enabled: true } });
    const t = new Date("2026-10-26T04:31:00Z");
    expect((await w.scheduler.tick(t)).briefings).toEqual(["morning"]);
    expect((await w.scheduler.tick(new Date(t.getTime() + 60_000))).briefings).toEqual([]);
    expect(w.sent).toHaveLength(1);
    expect(JSON.parse(w.sent[0]!.payload)).toMatchObject({ title: "Good morning, Oliver", body: "Your briefing is ready: 3 events today." });
  });

  it("respects opt-out of the morning briefing", async () => {
    const w = await world(new MockProvider({ delayMs: 0 }), { mode: "mock" });
    await updateSettings(w.db, w.cipher, w.user.id, { proactive: { morningBriefing: false } });
    expect((await w.scheduler.tick(new Date("2026-10-26T04:31:00Z"))).briefings).toEqual([]);
  });

  it("holds reminders during quiet hours and sends them after", async () => {
    const w = await world();
    await w.notifier.subscribe(w.user.id, { endpoint: "https://web.push.apple.com/x", keys: { p256dh: "k", auth: "a" } });
    await updateSettings(w.db, w.cipher, w.user.id, { notifications: { enabled: true }, proactive: { morningBriefing: false, eveningCheckIn: false, weeklyReview: false } });
    await w.deps.planning.createTask(w.user.id, { title: "Stretch", remindAt: "2026-10-26T22:00:00Z" });
    expect((await w.scheduler.tick(new Date("2026-10-26T22:05:00Z"))).reminders).toBe(0); // 23:05 Oslo
    expect((await w.scheduler.tick(new Date("2026-10-27T04:05:00Z"))).reminders).toBe(1); // 05:05 Oslo
    expect((await w.scheduler.tick(new Date("2026-10-27T04:06:00Z"))).reminders).toBe(0);
  });
});

describe("export", () => {
  it("exports everything decrypted", async () => {
    const w = await world();
    await w.deps.memory.create(w.user.id, { category: "profile", content: "Lives in Oslo", source: "user" });
    await collect(w.chat.send({ user: w.user, text: "hello" }));
    const data = await exportAll(w.db, w.cipher, w.deps, w.user);
    expect(data.memories[0]!.content).toBe("Lives in Oslo");
    expect(data.conversations[0]!.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(JSON.stringify(data)).not.toContain("v1:");
  });
});
