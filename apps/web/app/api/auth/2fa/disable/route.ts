import { disableTwoFactor } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const b = await readJson<{ password?: string; code?: string }>(req);
    await disableTwoFactor(maverick.db, maverick.cipher, user.id, String(b.password ?? ""), String(b.code ?? ""));
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
