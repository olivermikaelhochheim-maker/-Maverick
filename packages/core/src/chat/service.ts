import type { Db } from "../db/types";
import type { FieldCipher } from "../util/crypto";
import type { User } from "../auth";
import { getSettings, type Tier } from "../settings";
import { getSpend, noteSoftLimitCrossing, planCall, recordUsage, type SpendSummary } from "../budget";
import { costUsd, estimateTokens, modelInfo } from "../llm/catalog";
import { routeMessage } from "../llm/router";
import { ProviderError, type ChatTurn, type ToolDef } from "../llm/types";
import { proposalTools } from "../llm/tools";
import type { ProviderSet } from "../llm";
import { MemoryStore, renderMemories, type MemoryCategory } from "../memory";
import { PlanningStore } from "../planning";
import { SuggestionStore } from "../suggestions";
import { AgendaService } from "../integrations/calendar";
import { IntegrationStore } from "../integrations/store";
import { renderState, snapshot } from "../context";
import { BudgetExceededError, UserFacingError } from "../util/errors";
import { formatLocalNow } from "../util/time";
import { log } from "../util/logger";
import { ConversationStore, windowHistory } from "./conversations";
import { buildSystemPrompt, buildTurnContext } from "./persona";

export const MAX_USER_MESSAGE_CHARS = 20_000;
/** Tool round trips allowed per reply (each is another model call). */
export const MAX_TOOL_ROUNDS = 2;

export interface ContextItem {
  id: string;
  category: MemoryCategory;
  content: string;
  reason: string;
}

export type ChatStreamEvent =
  | {
      type: "meta";
      conversationId: string;
      userMessageId: string;
      model: string;
      tier: Tier;
      routeReason: string;
      mode: "live" | "mock";
      warnings: string[];
      context: ContextItem[];
    }
  | { type: "delta"; text: string }
  | { type: "suggestion"; id: string; kind: string; title: string }
  | {
      type: "done";
      assistantMessageId: string;
      costUsd: number;
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
      spend: SpendSummary;
      stopReason: string;
    }
  | { type: "error"; code: string; message: string; assistantMessageId?: string; spend?: SpendSummary };

export const EFFORT: Record<Tier, "low" | "medium" | "high"> = { fast: "low", standard: "medium", deep: "high" };

export interface ChatDeps {
  memory: MemoryStore;
  planning: PlanningStore;
  suggestions: SuggestionStore;
  agenda: AgendaService;
}

export function defaultDeps(db: Db, cipher: FieldCipher): ChatDeps {
  const memory = new MemoryStore(db, cipher);
  const planning = new PlanningStore(db, cipher);
  return {
    memory,
    planning,
    suggestions: new SuggestionStore(db, cipher, memory, planning),
    agenda: new AgendaService(null, new IntegrationStore(db, cipher)),
  };
}

/**
 * Opening line for conversations Maverick started (e.g. the morning briefing).
 * The API requires the first turn to be the user's, so we add a labelled stand-in.
 */
export const SYSTEM_OPENED_TURN = "[Maverick opened this conversation on schedule. Oliver is replying to it below.]";

export class ChatService {
  readonly conversations: ConversationStore;
  readonly deps: ChatDeps;

  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
    private readonly providers: ProviderSet,
    deps?: ChatDeps,
  ) {
    this.conversations = new ConversationStore(db, cipher);
    this.deps = deps ?? defaultDeps(db, cipher);
  }

  get mode() {
    return this.providers.mode;
  }

  /**
   * Send one user message and stream Maverick's reply.
   * Order: validate -> budget check -> persist user turn -> stream (with proposal tools) -> meter -> persist reply.
   * A budget refusal happens before anything is sent to a provider.
   */
  async *send(input: {
    user: User;
    conversationId?: string;
    text: string;
    deep?: boolean;
    signal?: AbortSignal;
  }): AsyncGenerator<ChatStreamEvent> {
    const text = input.text.trim();
    if (!text) throw new UserFacingError("Say something first.", "empty_message");
    if (text.length > MAX_USER_MESSAGE_CHARS) {
      throw new UserFacingError(`Messages are limited to ${MAX_USER_MESSAGE_CHARS.toLocaleString()} characters.`, "too_long");
    }

    const { user } = input;
    const settings = await getSettings(this.db, this.cipher, user.id);
    const spendBefore = await getSpend(this.db, user.id, settings);

    const route = routeMessage(text, settings, { deep: input.deep, softLimitReached: spendBefore.softLimitReached });
    const live = this.providers.mode === "live";
    const model = live ? route.model : "mock-maverick";
    const provider = live ? this.providers.primary : this.providers.mock;
    const info = modelInfo(model);

    // Conversation + history
    let conversationId = input.conversationId;
    let history: ChatTurn[] = [];
    if (conversationId) {
      const prior = await this.conversations.messages(user.id, conversationId, 200);
      history = prior.filter((m) => m.status !== "error" && m.content.trim()).map((m) => ({ role: m.role, content: m.content }));
      if (history[0]?.role === "assistant") history.unshift({ role: "user", content: SYSTEM_OPENED_TURN });
    }

    // Context: memories (with reasons) + current state. Sent per turn, not in the cached system prompt.
    const lastAssistant = [...history].reverse().find((t) => t.role === "assistant")?.content ?? "";
    const selected = await this.deps.memory.selectForPrompt(user.id, `${text}\n${lastAssistant.slice(0, 1000)}`);
    const state = await snapshot(this.deps, user.id, settings);
    const contextText = [renderMemories(selected, user.displayName), renderState(state, settings.timezone, user.displayName)].filter(Boolean).join("\n\n");

    const system = buildSystemPrompt(settings, user.displayName);
    const warnings: string[] = [];
    if (spendBefore.softLimitReached) {
      warnings.push(
        `Month-to-date spend ($${spendBefore.monthUsd.toFixed(2)}) is past your soft limit ($${spendBefore.monthSoftUsd.toFixed(2)}). Using the fast model.`,
      );
    }
    const turnContext = `${buildTurnContext(user.displayName, formatLocalNow(settings.timezone))}\n\n${contextText}`;
    const turns = windowHistory([...history, { role: "user" as const, content: text }], settings.routing.historyTokenBudget, estimateTokens);
    if (turns[0]?.role === "assistant") turns.unshift({ role: "user", content: SYSTEM_OPENED_TURN });
    const estInput = estimateTokens(system) + estimateTokens(turnContext) + turns.reduce((n, t) => n + estimateTokens(t.content), 0) + 900; // + tool schemas

    const useTools = settings.proactive.suggestFromChat;
    let plan;
    try {
      plan = planCall(spendBefore, info.price, estInput, settings.routing.maxOutputTokens, useTools ? 1 + MAX_TOOL_ROUNDS : 1);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        yield { type: "error", code: err.code, message: err.message, spend: spendBefore };
        return;
      }
      throw err;
    }
    if (plan.maxOutputTokens < settings.routing.maxOutputTokens) {
      warnings.push("Close to the spending cap, so this reply is length-limited.");
    }

    if (!conversationId) conversationId = await this.conversations.create(user.id, titleFrom(text));
    const userMessageId = await this.conversations.addMessage(conversationId, { role: "user", content: text });

    yield {
      type: "meta",
      conversationId,
      userMessageId,
      model,
      tier: route.tier,
      routeReason: route.reason,
      mode: this.providers.mode,
      warnings,
      context: selected.map((s) => ({ id: s.memory.id, category: s.memory.category, content: s.memory.content, reason: s.reason })),
    };

    // Proposals made by tools are queued here and surfaced as events in stream order.
    const proposed: { id: string; kind: string; title: string }[] = [];
    const tools: ToolDef[] = useTools
      ? proposalTools(this.deps.suggestions, { userId: user.id, source: "conversation", sourceRef: conversationId, onProposed: (s) => proposed.push(s) })
      : [];

    const started = Date.now();
    let reply = "";
    let finished: { usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }; stopReason: string } | null = null;
    let failure: ProviderError | null = null;

    try {
      for await (const ev of provider.stream({
        model,
        system,
        messages: turns,
        turnContext,
        maxOutputTokens: plan.maxOutputTokens,
        effort: EFFORT[route.tier],
        signal: input.signal,
        tools,
        maxToolRounds: MAX_TOOL_ROUNDS,
      })) {
        if (ev.type === "text") {
          reply += ev.text;
          yield { type: "delta", text: ev.text };
        } else if (ev.type === "tool") {
          while (proposed.length) yield { type: "suggestion", ...proposed.shift()! };
          // Separate text written before and after a tool call.
          if (reply && !reply.endsWith("\n")) {
            reply += "\n\n";
            yield { type: "delta", text: "\n\n" };
          }
        } else {
          finished = { usage: ev.usage, stopReason: ev.stopReason };
        }
      }
    } catch (err) {
      failure = err instanceof ProviderError ? err : new ProviderError("unknown", "Unexpected error talking to the model.");
      if (!(err instanceof ProviderError)) log.error("chat_stream_failed", { error: err as Error });
    }
    while (proposed.length) yield { type: "suggestion", ...proposed.shift()! };
    if (input.signal?.aborted && !failure) failure = new ProviderError("aborted", "Stopped.");

    const latencyMs = Date.now() - started;
    // If the stream died before reporting usage, charge an estimate so the budget errs on the safe side.
    const estimated = !finished;
    const usage =
      finished?.usage ??
      (reply || failure?.kind === "aborted" || failure?.kind === "refusal"
        ? { inputTokens: estInput, outputTokens: estimateTokens(reply) }
        : { inputTokens: 0, outputTokens: 0 }); // failed before generation: nothing billed
    const chargeable = usage.inputTokens + usage.outputTokens > 0;
    const cost = chargeable
      ? await recordUsage(this.db, { userId: user.id, conversationId, provider: provider.id, model, usage, price: info.price, estimated })
      : 0;

    const status = failure ? (reply ? "partial" : "error") : "complete";
    const assistantMessageId = await this.conversations.addMessage(conversationId, {
      role: "assistant",
      content: reply.trim() || (failure ? `[${failure.message}]` : ""),
      status,
      provider: provider.id,
      model,
      tier: route.tier,
      routeReason: route.reason,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: cost,
      latencyMs,
    });
    await this.deps.memory.recordContext(assistantMessageId, selected);
    await this.deps.memory.markUsed(selected.map((s) => s.memory.id));

    const spendAfter = await getSpend(this.db, user.id, settings);
    await noteSoftLimitCrossing(this.db, user.id, spendBefore, spendAfter);
    log.info("chat_turn", {
      model,
      tier: route.tier,
      status,
      inTok: usage.inputTokens,
      outTok: usage.outputTokens,
      costUsd: Number(costUsd(info.price, usage).toFixed(6)),
      latencyMs,
      memories: selected.length,
      errorKind: failure?.kind,
    });

    if (failure) {
      yield { type: "error", code: failure.kind, message: failure.message, assistantMessageId, spend: spendAfter };
      return;
    }
    yield {
      type: "done",
      assistantMessageId,
      costUsd: cost,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs,
      spend: spendAfter,
      stopReason: finished?.stopReason ?? "unknown",
    };
  }
}

export function titleFrom(text: string): string {
  const firstLine = text.split("\n")[0]!.trim();
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine || "New conversation";
}
