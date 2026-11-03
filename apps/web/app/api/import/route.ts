import { UserFacingError, importAll } from "@maverick/core";
import { apiUser, errorResponse, json } from "@/lib/server";

/** POST the JSON from "Export all data" on another Maverick. */
export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const text = await req.text();
    if (text.length > 25_000_000) throw new UserFacingError("That file is too large (max 25 MB).", "too_large", 413);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new UserFacingError("That file isn't valid JSON. Use the file from Settings → Export all data.", "bad_import");
    }
    return json({ imported: await importAll(maverick.db, maverick.cipher, user.id, data) });
  } catch (err) {
    return errorResponse(err);
  }
}
