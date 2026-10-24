import type { SuggestionStore } from "../suggestions";
import { parsePayload } from "../suggestions";
import { MEMORY_CATEGORIES } from "../memory";
import { HORIZONS } from "../planning";
import type { ToolDef } from "./types";

/**
 * Maverick's tools. Deliberately limited: every tool only PROPOSES something
 * to Oliver's inbox inside Maverick. None of them touches the outside world,
 * and none takes effect until Oliver accepts it.
 */
export function proposalTools(
  suggestions: SuggestionStore,
  ctx: { userId: string; source: "conversation" | "briefing"; sourceRef?: string; onProposed?: (s: { id: string; kind: string; title: string }) => void },
): ToolDef[] {
  const maxPerTurn = 5;
  let count = 0;

  const run = async (kind: string, input: Record<string, unknown>) => {
    if (count >= maxPerTurn) return { ok: false, content: "Limit reached: at most 5 proposals per reply. Mention any others in your text instead." };
    let payload;
    try {
      payload = parsePayload({ ...input, kind });
    } catch (err) {
      return { ok: false, content: `Invalid input: ${(err as Error).message}` };
    }
    const reason = typeof input.reason === "string" ? input.reason : null;
    const s = await suggestions.propose(ctx.userId, payload, { reason, source: ctx.source, sourceRef: ctx.sourceRef });
    if (!s) return { ok: true, content: "Already in Oliver's inbox; no need to propose it again." };
    count++;
    ctx.onProposed?.({ id: s.id, kind: s.kind, title: s.title });
    return {
      ok: true,
      content: "Added to Oliver's suggestion inbox. It is NOT saved yet; Oliver must accept it. Refer to it as a suggestion, not as done.",
    };
  };

  const nullable = (t: string, extra: Record<string, unknown> = {}) => ({ type: [t, "null"], ...extra });

  return [
    {
      name: "propose_memory",
      description:
        "Propose remembering a durable fact about Oliver (who Oliver is, a preference, a goal, a project, a decision, or a notable event). Use when Oliver states something worth remembering beyond this conversation, or explicitly asks you to remember something. Do not propose trivia, guesses presented as facts, or anything already in the memories you were given. Oliver approves it before it is saved.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...MEMORY_CATEGORIES] },
          content: { type: "string", description: "One self-contained sentence, written about Oliver in the third person." },
          confidence: { type: "number", description: "1.0 if Oliver said it directly; lower if you inferred it." },
          reason: nullable("string", { description: "Why this is worth remembering, in a few words." }),
        },
        required: ["category", "content", "confidence", "reason"],
        additionalProperties: false,
      },
      run: (input) => run("memory", input),
    },
    {
      name: "propose_task",
      description:
        "Propose a concrete task for Oliver's task list when the conversation produces a clear next action. Keep the title short and actionable (verb first).",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          notes: nullable("string"),
          priority: { type: "integer", enum: [1, 2, 3], description: "1 = high, 3 = low" },
          dueDate: nullable("string", { description: "YYYY-MM-DD in Oliver's local time, or null." }),
          reason: nullable("string"),
        },
        required: ["title", "notes", "priority", "dueDate", "reason"],
        additionalProperties: false,
      },
      run: (input) => run("task", input),
    },
    {
      name: "propose_goal",
      description: "Propose a goal when Oliver commits to a meaningful outcome. Include a measurable metric where possible.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          horizon: { type: "string", enum: [...HORIZONS] },
          metric: nullable("string", { description: "How success is measured." }),
          targetDate: nullable("string", { description: "YYYY-MM-DD or null." }),
          reason: nullable("string"),
        },
        required: ["title", "horizon", "metric", "targetDate", "reason"],
        additionalProperties: false,
      },
      run: (input) => run("goal", input),
    },
    {
      name: "suggest_action",
      description:
        "Suggest a specific action in Oliver's life or work that Oliver didn't ask for but would likely benefit from (e.g. prepare for a meeting, rest before a long day, follow up with someone). Use sparingly: only when you'd stake your judgement on it.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "The action, verb first." },
          why: { type: "string", description: "One or two sentences of reasoning." },
        },
        required: ["title", "why"],
        additionalProperties: false,
      },
      run: (input) => run("action", input),
    },
  ];
}
