/**
 * Model catalogue with list prices (USD per million tokens).
 * Source: Anthropic published pricing, checked 2026-10-24. Prices change, so
 * treat Anthropic's billing console as the ground truth. Maverick's meter is
 * an estimate.
 */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
}

export interface ModelInfo {
  id: string;
  provider: "anthropic" | "mock";
  label: string;
  price: ModelPrice;
  /** Whether the server-side refusal fallback (`fallbacks: "default"`) is available. */
  supportsServerFallback: boolean;
}

const p = (input: number, output: number, cacheRead: number): ModelPrice => ({
  inputPerMTok: input,
  outputPerMTok: output,
  cacheReadPerMTok: cacheRead,
  cacheWritePerMTok: input * 1.25,
});

export const MODELS: Record<string, ModelInfo> = {
  "claude-haiku-5-5": {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    label: "Claude Haiku 5.5 (fast)",
    // Prompts up to 100K tokens; Maverick keeps context well under that.
    price: p(0.1, 0.5, 0.01),
    supportsServerFallback: false,
  },
  "claude-sonnet-5-5": {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5 (standard)",
    price: p(2, 10, 0.2),
    supportsServerFallback: true,
  },
  "claude-opus-5-5": {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5 (deep)",
    price: p(4, 20, 0.2),
    supportsServerFallback: true,
  },
  "mock-maverick": {
    id: "mock-maverick",
    provider: "mock",
    label: "Mock (offline demo, free)",
    price: p(0, 0, 0),
    supportsServerFallback: false,
  },
};

export function modelInfo(id: string): ModelInfo {
  const m = MODELS[id];
  if (!m) throw new Error(`Unknown model: ${id}`);
  return m;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export function costUsd(price: ModelPrice, u: TokenUsage): number {
  return (
    (u.inputTokens * price.inputPerMTok +
      u.outputTokens * price.outputPerMTok +
      (u.cacheReadTokens ?? 0) * price.cacheReadPerMTok +
      (u.cacheWriteTokens ?? 0) * price.cacheWritePerMTok) /
    1_000_000
  );
}

/** Rough token estimate for budgeting before a call (~3.5 chars per token for English). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
