import { listSessions, revokeOtherSessions } from "@maverick/core";
import { apiUser, errorResponse, json } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user, token } = await apiUser(req);
    return json({ sessions: await listSessions(maverick.db, user.id, token) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/sessions: sign out every other device. */
export async function DELETE(req: Request) {
  try {
    const { maverick, user, token } = await apiUser(req);
    return json({ revoked: await revokeOtherSessions(maverick.db, user.id, token) });
  } catch (err) {
    return errorResponse(err);
  }
}
