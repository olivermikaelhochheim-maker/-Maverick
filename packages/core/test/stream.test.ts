import { describe, expect, it } from "vitest";
import { ndjsonStream } from "../src/chat/stream";
import { MockProvider } from "../src/llm/mock";
import { setup } from "./helpers";

describe("ndjsonStream", () => {
  it("serialises events one per line", async () => {
    async function* gen(): AsyncGenerator<Record<string, unknown>> {
      yield { a: 1 };
      yield { b: 2 };
    }
    const text = await new Response(ndjsonStream(gen(), new AbortController(), () => ({ err: true }))).text();
    expect(text).toBe('{"a":1}\n{"b":2}\n');
  });

  it("reports a thrown error as a final event", async () => {
    async function* gen(): AsyncGenerator<Record<string, unknown>> {
      yield { a: 1 };
      throw new Error("boom");
    }
    const text = await new Response(ndjsonStream(gen(), new AbortController(), () => ({ type: "error" }))).text();
    expect(text).toBe('{"a":1}\n{"type":"error"}\n');
  });

  it("on client disconnect: aborts the model call but still saves the partial reply and records cost", async () => {
    const { db, user, chat } = await setup(new MockProvider({ delayMs: 10 }));
    const abort = new AbortController();
    const events = chat.send({ user, text: "Tell me about procrastination and focus", signal: abort.signal });
    const stream = ndjsonStream(events, abort, () => ({}) as never);
    const reader = stream.getReader();
    await reader.read(); // meta
    await reader.read(); // first delta
    await reader.cancel(); // client goes away
    expect(abort.signal.aborted).toBe(true);

    // The service finishes in the background; wait for its writes.
    for (let i = 0; i < 100; i++) {
      const { rows } = await db.query("SELECT 1 FROM usage_events");
      if (rows.length) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const msgs = await db.query<{ status: string }>("SELECT status FROM messages WHERE role = 'assistant'");
    expect(msgs.rows.map((r) => r.status)).toEqual(["partial"]);
    const usage = await db.query<{ estimated: boolean }>("SELECT estimated FROM usage_events");
    expect(usage.rows).toHaveLength(1);
  });
});
