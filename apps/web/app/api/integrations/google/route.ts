import { revokeToken } from "@maverick/core";
import { apiUser, errorResponse, json } from "@/lib/server";

/** Disconnect Google: revoke the token at Google, then delete it here. */
export async function DELETE(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const tokens = await maverick.integrations.tokens(user.id, "google");
    if (tokens) await revokeToken(tokens.refreshToken ?? tokens.accessToken);
    await maverick.integrations.remove(user.id, "google");
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
