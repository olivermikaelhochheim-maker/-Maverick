import { UserFacingError, type BriefingKind } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

/** POST { kind } : "Brief me now". Always produces a fresh briefing; no notification. */
export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const { kind } = await readJson<{ kind?: string }>(req);
    if (!["morning", "evening", "weekly"].includes(String(kind))) throw new UserFacingError("Unknown briefing type.", "bad_request");
    const res = await maverick.briefings.run(user, kind as BriefingKind, { force: true, notify: false });
    return json(res);
  } catch (err) {
    return errorResponse(err);
  }
}
