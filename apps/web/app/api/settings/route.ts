import { getSettings, updateSettings } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ settings: await getSettings(maverick.db, maverick.cipher, user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const patch = await readJson(req);
    return json({ settings: await updateSettings(maverick.db, maverick.cipher, user.id, patch) });
  } catch (err) {
    return errorResponse(err);
  }
}
