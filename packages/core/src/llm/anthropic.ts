import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { modelInfo } from "./catalog";
import { ProviderError, type ChatEvent, type ChatRequest, type LLMProvider } from "./types";
import { getSecret } from "../util/secrets";

/** Claude via the official Anthropic SDK, streaming. */
export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  private client: Anthropic | null = null;

  constructor(private readonly apiKey: string | undefined = getSecret("ANTHROPIC_API_KEY")) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private getClient(): Anthropic {
    if (!this.apiKey) throw new ProviderError("auth", "No Anthropic API key is configured.");
    this.client ??= new Anthropic({ apiKey: this.apiKey, maxRetries: 2, timeout: 120_000 });
    return this.client;
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatEvent> {
    const client = this.getClient();
    const info = modelInfo(req.model);

    const messages: BetaMessageParam[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
    if (req.turnContext) {
      // Mid-conversation system message: operator context that doesn't
      // invalidate the cached prefix and can't be confused with user text.
      messages.push({ role: "system", content: req.turnContext });
    }

    const useFallback = info.supportsServerFallback;
    let stream;
    try {
      stream = client.beta.messages.stream(
        {
          model: req.model,
          max_tokens: req.maxOutputTokens,
          system: req.system,
          messages,
          thinking: { type: "adaptive" },
          output_config: { effort: req.effort ?? "medium" },
          // Cache the conversation prefix automatically; later turns re-read it at ~10% of input price.
          cache_control: { type: "ephemeral" },
          // On a safety-classifier decline, let the API retry on Anthropic's recommended fallback model.
          ...(useFallback ? { fallbacks: "default" as const, betas: ["server-side-fallback-2026-07-01"] } : {}),
        },
        { signal: req.signal },
      );
    } catch (err) {
      throw mapError(err);
    }

    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        throw new ProviderError("refusal", "The model declined to answer this request.");
      }
      yield {
        type: "done",
        stopReason: final.stop_reason ?? "unknown",
        servedBy: final.model,
        usage: {
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: final.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (err) {
      throw mapError(err);
    }
  }
}

function mapError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new ProviderError("aborted", "Stopped.");
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("auth", "The Anthropic API key was rejected. Check it in your setup.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError("rate_limit", "Anthropic is rate-limiting requests. Try again in a minute.", true);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new ProviderError("bad_request", `The request was rejected: ${err.message}`);
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new ProviderError("overloaded", "Anthropic is having trouble right now. Try again shortly.", true);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError("network", "Couldn't reach Anthropic. Check the internet connection.", true);
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError("unknown", `Anthropic returned an error (${err.status ?? "no status"}).`);
  }
  if (err instanceof Error && err.name === "AbortError") return new ProviderError("aborted", "Stopped.");
  return new ProviderError("unknown", "Unexpected error talking to the model.");
}
