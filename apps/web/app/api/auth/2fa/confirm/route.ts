import { confirmTwoFactorSetup } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req, { allowWithoutTwoFactor: true });
    const { code } = await readJson<{ code?: string }>(req);
    return json(await confirmTwoFactorSetup(maverick.db, maverick.cipher, user.id, String(code ?? "")));
  } catch (err) {
    return errorResponse(err);
  }
}
