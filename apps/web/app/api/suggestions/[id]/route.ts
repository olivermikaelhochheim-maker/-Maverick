import { UserFacingError } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

/** POST { action: "accept" | "dismiss", title?: string, reason?: "not_now" | "never" } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { maverick, user } = await apiUser(req);
    const { id } = await params;
    const b = await readJson<{ action?: string; title?: string; reason?: string }>(req);
    if (b.action === "accept") {
      return json(await maverick.deps.suggestions.accept(user.id, id, { title: typeof b.title === "string" ? b.title : undefined }));
    }
    if (b.action === "dismiss") {
      await maverick.deps.suggestions.dismiss(user.id, id, b.reason === "never" ? "never" : "not_now");
      return json({ ok: true });
    }
    throw new UserFacingError("Unknown action.", "bad_request");
  } catch (err) {
    return errorResponse(err);
  }
}
