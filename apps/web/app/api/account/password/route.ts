import { changePassword } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { maverick, user, token } = await apiUser(req);
    const body = await readJson<{ currentPassword?: string; newPassword?: string }>(req);
    await changePassword(maverick.db, user.id, String(body.currentPassword ?? ""), String(body.newPassword ?? ""), token);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
