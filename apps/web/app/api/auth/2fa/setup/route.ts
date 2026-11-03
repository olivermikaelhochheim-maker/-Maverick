import { beginTwoFactorSetup } from "@maverick/core";
import { apiUser, errorResponse, json } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req, { allowWithoutTwoFactor: true });
    return json(await beginTwoFactorSetup(maverick.db, maverick.cipher, user));
  } catch (err) {
    return errorResponse(err);
  }
}
