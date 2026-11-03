import { regenerateRecoveryCodes } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const { code } = await readJson<{ code?: string }>(req);
    return json(await regenerateRecoveryCodes(maverick.db, maverick.cipher, user.id, String(code ?? "")));
  } catch (err) {
    return errorResponse(err);
  }
}
