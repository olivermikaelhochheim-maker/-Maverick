import { UserFacingError, log, ndjsonStream } from "@maverick/core";
import { apiUser, errorResponse, readJson } from "@/lib/server";

/**
 * POST /api/chat  { text, conversationId?, deep? }
 * Streams newline-delimited JSON events: meta, delta..., then done or error.
 */
export async function POST(req: Request) {
  let ctx;
  let body;
  try {
    ctx = await apiUser(req);
    body = await readJson<{ text?: unknown; conversationId?: unknown; deep?: unknown; voice?: unknown }>(req, 100_000);
    if (typeof body.text !== "string") throw new UserFacingError("Message text is required.", "bad_request");
    if (body.conversationId !== undefined && typeof body.conversationId !== "string") {
      throw new UserFacingError("Invalid conversation.", "bad_request");
    }
  } catch (err) {
    return errorResponse(err);
  }
  const { maverick, user } = ctx;

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const events = maverick.chat.send({
    user,
    text: body.text as string,
    conversationId: (body.conversationId as string | undefined) || undefined,
    deep: body.deep === true,
    voice: body.voice === true,
    signal: abort.signal,
  });

  const stream = ndjsonStream<unknown>(events, abort, (err) => {
    if (err instanceof UserFacingError) return { type: "error", code: err.code, message: err.message };
    log.error("chat_route_failed", { error: err as Error });
    return { type: "error", code: "internal", message: "Something went wrong on Maverick's side." };
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
