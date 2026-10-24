import { SESSION_COOKIE, login } from "@maverick/core";
import { serializeCookie } from "@/lib/cookies";
import { assertSameOrigin, clientIp, errorResponse, getMaverick, isSecureRequest, json, readJson } from "@/lib/server";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await readJson<{ email?: string; password?: string }>(req);
    const { db } = await getMaverick();
    const { token, expiresAt, user } = await login(db, {
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      ip: await clientIp(),
      userAgent: req.headers.get("user-agent"),
    });
    const res = json({ ok: true, user: { displayName: user.displayName } });
    res.headers.append(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE, token, { expires: expiresAt, secure: isSecureRequest(req) }),
    );
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
