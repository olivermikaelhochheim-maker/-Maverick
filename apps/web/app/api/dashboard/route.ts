import { computeDashboard, getSettings } from "@maverick/core";
import { apiUser, errorResponse, json } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const settings = await getSettings(maverick.db, maverick.cipher, user.id);
    return json(await computeDashboard(maverick.db, maverick.cipher, maverick.deps, user, settings));
  } catch (err) {
    return errorResponse(err);
  }
}
