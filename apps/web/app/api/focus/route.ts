import { UserFacingError } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ session: await maverick.deps.focus.active(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST { action: "start", minutes?, taskId? } | { action: "stop", completed } */
export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const b = await readJson<{ action?: string; minutes?: unknown; taskId?: unknown; completed?: unknown }>(req);
    if (b.action === "start") return json({ session: await maverick.deps.focus.start(user.id, { minutes: b.minutes, taskId: b.taskId }) });
    if (b.action === "stop") return json({ session: await maverick.deps.focus.stop(user.id, b.completed === true) });
    throw new UserFacingError("Unknown action.", "bad_request");
  } catch (err) {
    return errorResponse(err);
  }
}
