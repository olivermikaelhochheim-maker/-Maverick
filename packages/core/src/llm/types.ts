import type { TokenUsage } from "./catalog";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * A tool the model may call. `run` executes it inside Maverick; the provider
 * loops (call -> run -> return result) up to `maxToolRounds` times.
 */
export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema with additionalProperties: false and every property required (strict mode). */
  inputSchema: Record<string, unknown>;
  run(input: Record<string, unknown>): Promise<{ ok: boolean; content: string }>;
}

export interface ChatRequest {
  model: string;
  system: string;
  messages: ChatTurn[];
  /**
   * Operator context appended after the latest user turn (e.g. the current
   * local time). Kept out of `system` so the cached prompt prefix stays stable.
   */
  turnContext?: string;
  maxOutputTokens: number;
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
  tools?: ToolDef[];
  /** Max tool-use round trips per request (each is another model call). Default 2. */
  maxToolRounds?: number;
}

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; ok: boolean }
  | { type: "done"; usage: TokenUsage; stopReason: string; servedBy: string };

export type ProviderErrorKind =
  | "auth"
  | "rate_limit"
  | "overloaded"
  | "bad_request"
  | "network"
  | "refusal"
  | "aborted"
  | "unknown";

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * Every language-model vendor sits behind this interface. Swapping vendors
 * means writing one new class, not changing the app.
 */
export interface LLMProvider {
  readonly id: string;
  /** True when credentials are present. A mock provider is always configured. */
  isConfigured(): boolean;
  stream(req: ChatRequest): AsyncIterable<ChatEvent>;
}
