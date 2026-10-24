import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import type { LLMProvider } from "./types";

export * from "./types";
export * from "./catalog";
export { routeMessage, type RouteDecision } from "./router";
export { AnthropicProvider } from "./anthropic";
export { MockProvider } from "./mock";

export interface ProviderSet {
  /** Provider used for real models. */
  primary: LLMProvider;
  mock: LLMProvider;
  /** "live" when a real provider is configured, else "mock". */
  mode: "live" | "mock";
}

/**
 * MAVERICK_LLM_PROVIDER=mock      -> always use the free offline mock
 * MAVERICK_LLM_PROVIDER=anthropic -> require an Anthropic key
 * unset                           -> Anthropic if a key is found, else mock
 */
export function createProviders(env: NodeJS.ProcessEnv = process.env): ProviderSet {
  const mock = new MockProvider();
  const choice = env.MAVERICK_LLM_PROVIDER?.toLowerCase();
  if (choice === "mock") return { primary: mock, mock, mode: "mock" };
  const anthropic = new AnthropicProvider();
  if (anthropic.isConfigured()) return { primary: anthropic, mock, mode: "live" };
  return { primary: mock, mock, mode: "mock" };
}
