import { randomUUID } from "node:crypto";
import type { Db } from "./db/types";
import type { FieldCipher } from "./util/crypto";
import type { User } from "./auth";
import type { ProviderSet } from "./llm";
import { getSettings, type Settings } from "./settings";
import { getSpend, planCall, recordUsage } from "./budget";
import { estimateTokens, modelInfo } from "./llm/catalog";
import { proposalTools } from "./llm/tools";
import { renderMemories } from "./memory";
import { renderState, snapshot, type StateSnapshot } from "./context";
import { formatEventTime } from "./integrations/calendar";
import { buildSystemPrompt, buildTurnContext } from "./chat/persona";
import { ConversationStore } from "./chat/conversations";
import { EFFORT, type ChatDeps } from "./chat/service";
import type { Notifier } from "./notify";
import { audit } from "./audit";
import { addDays, formatLocalNow, localParts, zonedToUtc } from "./util/time";
import { BudgetExceededError } from "./util/errors";
import { log } from "./util/logger";

export type BriefingKind = "morning" | "evening" | "weekly";

export interface BriefingResult {
  status: "done" | "exists" | "skipped";
  conversationId?: string;
  /** "model" when written by Claude, "template" when assembled without a model call */
  mode?: "model" | "template";
  note?: string;
}

const TITLES: Record<BriefingKind, string> = { morning: "Morning briefing", evening: "Evening check-in", weekly: "Weekly review" };

const INSTRUCTIONS: Record<BriefingKind, (name: string) => string> = {
  morning: (n) => `[Scheduled morning briefing] Write ${n}'s morning briefing.
- Open with a one-line greeting suited to the day.
- Calendar: list today's events from the context only. Never invent events. If the calendar isn't connected, say so in one line.
- Priorities: the top three things to move forward today, drawn from open tasks and goals. Say why if you reorder them.
- If you see something genuinely useful ${n} hasn't planned (preparation for a meeting, recovery, a follow-up), propose it with suggest_action or propose_task. At most two proposals; none is fine.
- End by asking which single outcome matters most today.
Under 220 words. Warm, direct, no filler.`,
  evening: (n) => `[Scheduled evening check-in] Write ${n}'s evening check-in.
- Acknowledge what got done today (completed tasks in the context), without flattery.
- Note what's still open, without shaming.
- Ask three short reflection questions: what went well, what got in the way, what's the first move tomorrow.
- If a clear next action stands out for tomorrow, propose it with propose_task (at most one).
Under 160 words.`,
  weekly: (n) => `[Scheduled weekly review] Write ${n}'s weekly review.
- What moved this week (completed tasks in the context) and how it connects to the active goals.
- Which goal got no attention, said plainly.
- One honest observation about patterns (focus, procrastination, energy) only if the evidence supports it; otherwise skip it.
- Propose up to three tasks for next week with propose_task, tied to goals.
- End with: what is the one thing that would make next week a success?
Under 300 words.`,
};

export class BriefingService {
  private readonly conversations: ConversationStore;

  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
    private readonly providers: ProviderSet,
    private readonly deps: ChatDeps,
    private readonly notifier: Notifier | null,
  ) {
    this.conversations = new ConversationStore(db, cipher);
  }

  async alreadyDone(userId: string, kind: BriefingKind, localDate: string): Promise<boolean> {
    const { rows } = await this.db.query("SELECT 1 FROM briefings WHERE user_id = $1 AND kind = $2 AND local_date = $3", [userId, kind, localDate]);
    return rows.length > 0;
  }

  async latest(userId: string, limit = 5): Promise<{ kind: BriefingKind; localDate: string; conversationId: string | null; createdAt: string }[]> {
    const { rows } = await this.db.query<{ kind: BriefingKind; local_date: string; conversation_id: string | null; created_at: Date | string }>(
      "SELECT kind, local_date, conversation_id, created_at FROM briefings WHERE user_id = $1 AND status = 'done' ORDER BY created_at DESC LIMIT $2",
      [userId, limit],
    );
    return rows.map((r) => ({ kind: r.kind, localDate: r.local_date, conversationId: r.conversation_id, createdAt: new Date(r.created_at).toISOString() }));
  }

  /**
   * Produce a briefing. Scheduled runs are once per kind per local day;
   * `force` (Oliver pressing "Brief me now") always produces a fresh one.
   */
  async run(user: User, kind: BriefingKind, opts: { now?: Date; force?: boolean; notify?: boolean } = {}): Promise<BriefingResult> {
    const now = opts.now ?? new Date();
    const settings = await getSettings(this.db, this.cipher, user.id);
    const local = localParts(settings.timezone, now);
    if (!opts.force && (await this.alreadyDone(user.id, kind, local.date))) return { status: "exists" };

    const state = await snapshot(this.deps, user.id, settings, now);
    const since =
      kind === "weekly" ? zonedToUtc(addDays(local.date, -6), "00:00", settings.timezone) : zonedToUtc(local.date, "00:00", settings.timezone);
    const completed = kind === "morning" ? [] : await this.deps.planning.completedSince(user.id, since);
    const title = `${TITLES[kind]} · ${new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, weekday: "short", day: "numeric", month: "short" }).format(now)}`;
    const conversationId = await this.conversations.create(user.id, title);

    let content: string;
    let mode: "model" | "template" = "template";
    let note: string | undefined;
    let meta: { model?: string; inputTokens?: number; outputTokens?: number; costUsd?: number } = {};

    const written = this.providers.mode === "live" ? await this.writeWithModel(user, kind, settings, state, completed, conversationId, now) : null;
    if (written && "content" in written) {
      content = written.content;
      mode = "model";
      meta = written.meta;
    } else {
      note = written?.note ?? (this.providers.mode === "mock" ? "No AI model connected" : undefined);
      content = template(kind, user.displayName, settings, state, completed, note);
    }

    await this.conversations.addMessage(conversationId, {
      role: "assistant",
      content,
      provider: mode === "model" ? this.providers.primary.id : "template",
      model: meta.model ?? "template",
      tier: "standard",
      routeReason: `Scheduled ${TITLES[kind].toLowerCase()}`,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      costUsd: meta.costUsd ?? 0,
    });
    await this.db.query(
      "INSERT INTO briefings (id, user_id, kind, local_date, conversation_id, status, note) VALUES ($1,$2,$3,$4,$5,'done',$6) ON CONFLICT (user_id, kind, local_date) DO NOTHING",
      [randomUUID(), user.id, kind, local.date, conversationId, note ?? null],
    );
    await audit(this.db, { userId: user.id, actor: "system", action: `briefing.${kind}`, target: conversationId, details: { mode, forced: Boolean(opts.force) } });

    if (opts.notify !== false && this.notifier) {
      const events = state.agenda.status === "ok" ? state.agenda.events.length : null;
      const body =
        kind === "morning"
          ? `Your briefing is ready${events !== null ? `: ${events} event${events === 1 ? "" : "s"} today` : ""}.`
          : kind === "evening"
            ? "Two minutes to close the day?"
            : "Your weekly review is ready.";
      const greeting = kind === "morning" ? `Good morning, ${user.displayName}` : TITLES[kind];
      await this.notifier.notify(user.id, settings, { kind: kind === "morning" ? "briefing" : kind === "evening" ? "checkin" : "review", title: greeting, body, url: `/chat/${conversationId}` }, now);
    }
    return { status: "done", conversationId, mode, note };
  }

  /** Returns the written briefing, or a note explaining why the template was used instead. */
  private async writeWithModel(
    user: User,
    kind: BriefingKind,
    settings: Settings,
    state: StateSnapshot,
    completed: { title: string }[],
    conversationId: string,
    now: Date,
  ): Promise<{ content: string; meta: { model: string; inputTokens: number; outputTokens: number; costUsd: number } } | { note: string }> {
    const model = settings.routing.models.standard;
    const info = modelInfo(model);
    const spend = await getSpend(this.db, user.id, settings, now);
    if (spend.softLimitReached) return { note: "Budget soft limit reached, so this briefing was assembled without the AI model" };

    const memories = await this.deps.memory.selectForPrompt(user.id, "", 1200);
    const done = completed.length ? `Completed ${kind === "weekly" ? "this week" : "today"}:\n${completed.map((t) => `- ${t.title}`).join("\n")}` : `Completed ${kind === "weekly" ? "this week" : "today"}: nothing recorded.`;
    const turnContext = [
      buildTurnContext(user.displayName, formatLocalNow(settings.timezone, now)),
      renderMemories(memories, user.displayName),
      renderState(state, settings.timezone, user.displayName),
      kind === "morning" ? "" : done,
    ]
      .filter(Boolean)
      .join("\n\n");
    const system = buildSystemPrompt(settings, user.displayName);
    const messages = [{ role: "user" as const, content: INSTRUCTIONS[kind](user.displayName) }];
    const estInput = estimateTokens(system) + estimateTokens(turnContext) + estimateTokens(messages[0]!.content) + 900;

    let plan;
    try {
      plan = planCall(spend, info.price, estInput, 1500, 3);
    } catch (err) {
      if (err instanceof BudgetExceededError) return { note: "Spending cap reached, so this briefing was assembled without the AI model" };
      throw err;
    }

    let text = "";
    let usage = { inputTokens: 0, outputTokens: 0 } as { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };
    let finished = false;
    try {
      for await (const ev of this.providers.primary.stream({
        model,
        system,
        messages,
        turnContext,
        maxOutputTokens: plan.maxOutputTokens,
        effort: EFFORT.standard,
        tools: settings.proactive.suggestFromChat ? proposalTools(this.deps.suggestions, { userId: user.id, source: "briefing", sourceRef: conversationId }) : [],
        maxToolRounds: 2,
      })) {
        if (ev.type === "text") text += ev.text;
        else if (ev.type === "tool") text += text && !text.endsWith("\n") ? "\n\n" : "";
        else if (ev.type === "done") {
          usage = ev.usage;
          finished = true;
        }
      }
    } catch (err) {
      log.warn("briefing_model_failed", { kind, error: err as Error });
      if (text) await recordUsage(this.db, { userId: user.id, conversationId, provider: this.providers.primary.id, model, usage: { inputTokens: estInput, outputTokens: estimateTokens(text) }, price: info.price, estimated: true });
      return { note: "The AI model was unavailable, so this briefing was assembled without it" };
    }
    if (!finished || !text.trim()) return { note: "The AI model returned nothing, so this briefing was assembled without it" };
    const costUsd = await recordUsage(this.db, { userId: user.id, conversationId, provider: this.providers.primary.id, model, usage, price: info.price });
    return { content: text.trim(), meta: { model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd } };
  }
}

/** A useful briefing with no model call: real calendar, real tasks, honest about what's missing. */
export function template(
  kind: BriefingKind,
  name: string,
  settings: Settings,
  state: StateSnapshot,
  completed: { title: string }[],
  note?: string,
): string {
  const tz = settings.timezone;
  const lines: string[] = [];
  const agenda = () => {
    if (state.agenda.status === "ok") {
      lines.push("**Calendar**");
      if (state.agenda.events.length) for (const e of state.agenda.events) lines.push(`- ${formatEventTime(e, tz)} ${e.title}`);
      else lines.push("- Nothing scheduled.");
    } else if (state.agenda.status === "not_connected" || state.agenda.status === "not_configured") {
      lines.push("**Calendar**: not connected yet. Connect Google Calendar in Settings.");
    } else lines.push(`**Calendar**: unavailable (${state.agenda.message ?? "error"}).`);
  };
  const open = (n: number) => {
    if (!state.tasks.length) {
      lines.push("**Open tasks**: none. Tell me what you're working on and I'll help you shape it.");
      return;
    }
    lines.push("**Top priorities**");
    const due = (d: string) => (d === state.localDate ? " (due today)" : d < state.localDate ? ` (due ${d}, overdue)` : ` (due ${d})`);
    state.tasks.slice(0, n).forEach((t, i) => lines.push(`${i + 1}. ${t.title}${t.dueDate ? due(t.dueDate) : ""}`));
  };

  if (kind === "morning") {
    lines.push(`Good morning, ${name}. Here's your day.`, "");
    agenda();
    lines.push("");
    open(3);
    if (state.goals.length) lines.push("", `**Goals in play**: ${state.goals.slice(0, 4).map((g) => g.title).join(" · ")}`);
    if (state.pendingSuggestions) lines.push("", `${state.pendingSuggestions} suggestion${state.pendingSuggestions === 1 ? "" : "s"} waiting in your inbox.`);
    lines.push("", "**Which single outcome matters most today?**");
  } else if (kind === "evening") {
    lines.push(`Evening, ${name}. Two minutes to close the day.`, "");
    lines.push(completed.length ? `**Done today**\n${completed.map((t) => `- ${t.title}`).join("\n")}` : "**Done today**: nothing marked complete.");
    lines.push("");
    open(3);
    lines.push("", "1. What went well?", "2. What got in the way?", "3. What's the first move tomorrow?");
  } else {
    lines.push(`Weekly review, ${name}.`, "");
    lines.push(completed.length ? `**Completed this week (${completed.length})**\n${completed.map((t) => `- ${t.title}`).join("\n")}` : "**Completed this week**: nothing marked complete.");
    lines.push("", state.goals.length ? `**Active goals**\n${state.goals.map((g) => `- ${g.title}`).join("\n")}` : "**Active goals**: none recorded yet. That's the first thing to fix.");
    lines.push("", "**What is the one thing that would make next week a success?**");
  }
  if (note) lines.push("", `_(${note}.)_`);
  return lines.join("\n");
}
