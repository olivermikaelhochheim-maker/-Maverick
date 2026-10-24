/**
 * Turn chat events into a newline-delimited JSON byte stream for HTTP.
 *
 * If the client disconnects (e.g. Oliver presses Stop), we abort the model
 * call but keep draining the event source to the end, so the chat service
 * still saves the partial reply and records the cost. Abandoning the
 * generator mid-way would skip both, leaking budget.
 */
export function ndjsonStream<T>(
  events: AsyncIterable<T>,
  abort: AbortController,
  onError: (err: unknown) => T,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let open = true;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: T) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        } catch {
          open = false;
          abort.abort();
        }
      };
      try {
        for await (const ev of events) send(ev);
      } catch (err) {
        send(onError(err));
      } finally {
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
    cancel() {
      open = false;
      abort.abort();
    },
  });
}
