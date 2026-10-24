import { estimateTokens } from "./catalog";
import { ProviderError, type ChatEvent, type ChatRequest, type LLMProvider } from "./types";

/**
 * Offline stand-in for a real model. Deterministic, free, and clearly labelled
 * in the UI. Used for the demo before an API key exists and for all tests.
 */
export class MockProvider implements LLMProvider {
  readonly id = "mock";

  constructor(private readonly opts: { delayMs?: number; failWith?: ProviderError } = {}) {}

  isConfigured(): boolean {
    return true;
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatEvent> {
    if (this.opts.failWith) throw this.opts.failWith;
    const last = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const reply = mockReply(last);
    const delay = this.opts.delayMs ?? 15;
    const words = reply.split(/(\s+)/);
    let out = 0;
    for (const w of words) {
      if (req.signal?.aborted) throw new ProviderError("aborted", "Stopped.");
      if (out + estimateTokens(w) > req.maxOutputTokens) break;
      out += estimateTokens(w);
      if (delay) await new Promise((r) => setTimeout(r, delay));
      yield { type: "text", text: w };
    }
    const inputText = req.system + req.messages.map((m) => m.content).join("\n") + (req.turnContext ?? "");
    yield {
      type: "done",
      stopReason: "end_turn",
      servedBy: req.model,
      usage: { inputTokens: estimateTokens(inputText), outputTokens: Math.max(out, 1) },
    };
  }
}

function mockReply(input: string): string {
  const text = input.toLowerCase();
  const note =
    "\n\n_(Mock mode: no AI model is connected yet, so this is a scripted reply. Add an Anthropic API key to talk to the real Maverick.)_";
  if (/^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/.test(text)) {
    return `Good to see you, Oliver. Everything is running, and I'm in demonstration mode until a model is connected. What's the one outcome that matters most today?${note}`;
  }
  if (/procrastinat|focus|stuck/.test(text)) {
    return `Here's the approach I'd suggest, Oliver:\n\n1. Name the single task you're avoiding.\n2. Shrink it to a first step under ten minutes.\n3. Start a timer and do only that.\n\nMomentum tends to follow the first step, not the other way round.${note}`;
  }
  if (/zorza|revenue|client|marketing/.test(text)) {
    return `Before I project anything for Zorza I need actual baselines: current monthly revenue, number of clients, average retainer, and gross margin. I won't invent those figures. Once you share them, we can work backwards from the $100k/month goal.${note}`;
  }
  return `Understood. You said: "${input.slice(0, 160)}". In live mode I'd give you a considered answer; in mock mode I can only confirm the pipeline works end to end: your message was saved, streamed, metered and logged.${note}`;
}
