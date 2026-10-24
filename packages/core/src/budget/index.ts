import { randomUUID } from "node:crypto";
import type { Db } from "../db/types";
import type { Settings } from "../settings";
import { audit } from "../audit";
import { costUsd, type ModelPrice, type TokenUsage } from "../llm/catalog";
import { BudgetExceededError } from "../util/errors";
import { dayStartUtc, monthStartUtc } from "../util/time";

export interface SpendSummary {
  monthUsd: number;
  todayUsd: number;
  monthSoftUsd: number;
  monthHardUsd: number;
  dailyHardUsd: number;
  softLimitReached: boolean;
  hardLimitReached: boolean;
  /** Fraction of the monthly hard limit used, 0..1+ */
  monthFraction: number;
  periodStart: string;
}

export async function getSpend(db: Db, userId: string, settings: Settings, now = new Date()): Promise<SpendSummary> {
  const { rows } = await db.query<{ month: number | string | null; today: number | string | null }>(
    `SELECT
       COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= $2), 0) AS month,
       COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= $3), 0) AS today
     FROM usage_events WHERE user_id = $1 AND created_at >= $2`,
    [userId, monthStartUtc(now).toISOString(), dayStartUtc(now).toISOString()],
  );
  const monthUsd = Number(rows[0]?.month ?? 0);
  const todayUsd = Number(rows[0]?.today ?? 0);
  const b = settings.budget;
  return {
    monthUsd,
    todayUsd,
    monthSoftUsd: b.monthlySoftUsd,
    monthHardUsd: b.monthlyHardUsd,
    dailyHardUsd: b.dailyHardUsd,
    softLimitReached: monthUsd >= b.monthlySoftUsd,
    hardLimitReached: monthUsd >= b.monthlyHardUsd || todayUsd >= b.dailyHardUsd,
    monthFraction: b.monthlyHardUsd > 0 ? monthUsd / b.monthlyHardUsd : 1,
    periodStart: monthStartUtc(now).toISOString(),
  };
}

export interface BudgetPlan {
  /** max_tokens to request so the worst case cannot exceed the remaining budget. */
  maxOutputTokens: number;
  estimatedInputCostUsd: number;
  worstCaseCostUsd: number;
}

/**
 * Hard enforcement before a model call.
 *
 * The worst-case cost of a call is (input tokens × input price) + (max_tokens × output price).
 * We shrink max_tokens until the worst case fits inside what is left of both the
 * daily and monthly hard limits, and refuse the call if even a short reply won't fit.
 */
export function planCall(
  spend: SpendSummary,
  price: ModelPrice,
  estimatedInputTokens: number,
  requestedMaxOutputTokens: number,
  /** Model calls this request may make (tool round trips each add one). */
  calls = 1,
): BudgetPlan {
  // Budget per call: each round trip re-sends the input and may produce max output.
  const remaining = Math.min(spend.monthHardUsd - spend.monthUsd, spend.dailyHardUsd - spend.todayUsd) / Math.max(1, calls);
  const inputCost = (estimatedInputTokens * price.inputPerMTok) / 1_000_000;
  const MIN_USEFUL_OUTPUT = 256;

  if (price.outputPerMTok === 0 && price.inputPerMTok === 0) {
    return { maxOutputTokens: requestedMaxOutputTokens, estimatedInputCostUsd: 0, worstCaseCostUsd: 0 };
  }
  if (spend.hardLimitReached || remaining <= inputCost) {
    throw new BudgetExceededError(hardLimitMessage(spend));
  }
  const affordableOutput = Math.floor(((remaining - inputCost) * 1_000_000) / price.outputPerMTok);
  if (affordableOutput < MIN_USEFUL_OUTPUT) {
    throw new BudgetExceededError(hardLimitMessage(spend));
  }
  const maxOutputTokens = Math.min(requestedMaxOutputTokens, affordableOutput);
  return {
    maxOutputTokens,
    estimatedInputCostUsd: inputCost,
    worstCaseCostUsd: (inputCost + (maxOutputTokens * price.outputPerMTok) / 1_000_000) * Math.max(1, calls),
  };
}

function hardLimitMessage(s: SpendSummary): string {
  const daily = s.todayUsd >= s.dailyHardUsd - 0.0001 || s.dailyHardUsd - s.todayUsd < s.monthHardUsd - s.monthUsd;
  return daily
    ? `Today's spending cap ($${s.dailyHardUsd.toFixed(2)}) is reached, so I've paused model calls until tomorrow (UTC). You can raise the cap in Settings.`
    : `This month's hard cap ($${s.monthHardUsd.toFixed(2)}) is reached, so I've paused model calls. You can raise the cap in Settings.`;
}

export async function recordUsage(
  db: Db,
  entry: {
    userId: string;
    conversationId?: string;
    provider: string;
    model: string;
    usage: TokenUsage;
    price: ModelPrice;
    estimated?: boolean;
  },
): Promise<number> {
  const cost = costUsd(entry.price, entry.usage);
  await db.query(
    `INSERT INTO usage_events
       (id, user_id, conversation_id, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, estimated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      randomUUID(),
      entry.userId,
      entry.conversationId ?? null,
      entry.provider,
      entry.model,
      entry.usage.inputTokens,
      entry.usage.outputTokens,
      entry.usage.cacheReadTokens ?? 0,
      entry.usage.cacheWriteTokens ?? 0,
      cost,
      entry.estimated ?? false,
    ],
  );
  return cost;
}

/** Audit the first crossing of the soft limit each month (once). */
export async function noteSoftLimitCrossing(db: Db, userId: string, before: SpendSummary, after: SpendSummary) {
  if (!before.softLimitReached && after.softLimitReached) {
    await audit(db, {
      userId,
      actor: "system",
      action: "budget.soft_limit_reached",
      details: { monthUsd: Number(after.monthUsd.toFixed(4)), softUsd: after.monthSoftUsd },
    });
  }
}

export interface UsageBreakdown {
  byModel: { model: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number }[];
  byDay: { day: string; costUsd: number; calls: number }[];
  estimatedCalls: number;
}

export async function getUsageBreakdown(db: Db, userId: string, now = new Date()): Promise<UsageBreakdown> {
  const start = monthStartUtc(now).toISOString();
  const byModel = await db.query<{ model: string; calls: number; input: number; output: number; cost: number }>(
    `SELECT model, count(*)::int AS calls, COALESCE(SUM(input_tokens),0)::int AS input,
            COALESCE(SUM(output_tokens),0)::int AS output, COALESCE(SUM(cost_usd),0) AS cost
     FROM usage_events WHERE user_id = $1 AND created_at >= $2 GROUP BY model ORDER BY cost DESC`,
    [userId, start],
  );
  const byDay = await db.query<{ day: string; cost: number; calls: number }>(
    `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COALESCE(SUM(cost_usd),0) AS cost, count(*)::int AS calls
     FROM usage_events WHERE user_id = $1 AND created_at >= $2 GROUP BY 1 ORDER BY 1`,
    [userId, start],
  );
  const est = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM usage_events WHERE user_id = $1 AND created_at >= $2 AND estimated",
    [userId, start],
  );
  return {
    byModel: byModel.rows.map((r) => ({
      model: r.model,
      calls: Number(r.calls),
      inputTokens: Number(r.input),
      outputTokens: Number(r.output),
      costUsd: Number(r.cost),
    })),
    byDay: byDay.rows.map((r) => ({ day: r.day, costUsd: Number(r.cost), calls: Number(r.calls) })),
    estimatedCalls: Number(est.rows[0]?.n ?? 0),
  };
}
