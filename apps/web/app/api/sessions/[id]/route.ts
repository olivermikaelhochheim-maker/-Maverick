import { revokeSession } from "@maverick/core";
import { apiUser, errorResponse, json } from "@/lib/server";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { maverick, user } = await apiUser(req);
    const { id } = await params;
    return json({ ok: await revokeSession(maverick.db, user.id, id) });
  } catch (err) {
    return errorResponse(err);
  }
}
