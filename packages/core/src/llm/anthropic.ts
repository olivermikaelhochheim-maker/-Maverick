import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { modelInfo } from "./catalog";
import { ProviderError, type ChatEvent, type ChatRequest, type LLMProvider, type ToolDef } from "./types";
import { getSecret } from "../util/secrets";

/** Claude via the official Anthropic SDK, streaming, with a bounded tool loop. */
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
    const tools = req.tools ?? [];
    const maxRounds = req.maxToolRounds ?? 2;

    const messages: BetaMessageParam[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
    if (req.turnContext) {
      // Mid-conversation system message: operator context that doesn't
      // invalidate the cached prefix and can't be confused with user text.
      messages.push({ role: "system", content: req.turnContext });
    }

    const apiTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
      strict: true,
      eager_input_streaming: true,
    })) as unknown as BetaToolUnion[];

    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    let final: BetaMessage | null = null;

    try {
      for (let round = 0; ; round++) {
        const stream = client.beta.messages.stream(
          {
            model: req.model,
            max_tokens: req.maxOutputTokens,
            system: req.system,
            messages,
            thinking: { type: "adaptive" },
            output_config: { effort: req.effort ?? "medium" },
            // Cache the conversation prefix automatically; later turns re-read it at ~10% of input price.
            cache_control: { type: "ephemeral" },
            ...(apiTools.length ? { tools: apiTools } : {}),
            // On a safety-classifier decline, let the API retry on Anthropic's recommended fallback model.
            ...(info.supportsServerFallback ? { fallbacks: "default" as const, betas: ["server-side-fallback-2026-07-01"] } : {}),
          },
          { signal: req.signal },
        );
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "text", text: event.delta.text };
          }
        }
        final = await stream.finalMessage();
        usage.inputTokens += final.usage.input_tokens;
        usage.outputTokens += final.usage.output_tokens;
        usage.cacheReadTokens += final.usage.cache_read_input_tokens ?? 0;
        usage.cacheWriteTokens += final.usage.cache_creation_input_tokens ?? 0;

        if (final.stop_reason === "refusal") {
          throw new ProviderError("refusal", "The model declined to answer this request.");
        }
        const toolUses = final.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
        // Never run tools from a truncated reply; never loop past the limit.
        if (final.stop_reason !== "tool_use" || toolUses.length === 0 || round >= maxRounds) break;

        // Echo the assistant turn back unchanged (including thinking blocks), then the results.
        messages.push({ role: "assistant", content: final.content });
        const results: BetaToolResultBlockParam[] = [];
        for (const use of toolUses) {
          const result = await runTool(tools, use);
          yield { type: "tool", name: use.name, ok: result.ok };
          results.push({ type: "tool_result", tool_use_id: use.id, content: result.content, ...(result.ok ? {} : { is_error: true }) });
        }
        messages.push({ role: "user", content: results });
      }
    } catch (err) {
      throw mapError(err);
    }

    yield { type: "done", stopReason: final?.stop_reason ?? "unknown", servedBy: final?.model ?? req.model, usage };
  }
}

async function runTool(tools: ToolDef[], use: BetaToolUseBlock): Promise<{ ok: boolean; content: string }> {
  const tool = tools.find((t) => t.name === use.name);
  if (!tool) return { ok: false, content: `Unknown tool: ${use.name}` };
  // Eager input streaming means the API doesn't validate inputs; the tool's own run() validates.
  if (typeof use.input !== "object" || use.input === null || Array.isArray(use.input)) {
    return { ok: false, content: "INVALID_JSON: tool input must be an object." };
  }
  try {
    return await tool.run(use.input as Record<string, unknown>);
  } catch (err) {
    return { ok: false, content: `Tool failed: ${(err as Error).message}` };
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
