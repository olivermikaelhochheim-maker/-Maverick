import { SESSION_COOKIE, logout, validateSession } from "@maverick/core";
import { assertSameOrigin, errorResponse, getMaverick, getSessionToken, json } from "@/lib/server";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { db } = await getMaverick();
    const token = await getSessionToken();
    const user = await validateSession(db, token);
    await logout(db, token, user?.id);
    const res = json({ ok: true });
    res.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
