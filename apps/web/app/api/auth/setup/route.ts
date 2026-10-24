import { SESSION_COOKIE, createInitialUser, createSession, getSecret, hashIp } from "@maverick/core";
import { assertSameOrigin, clientIp, errorResponse, getMaverick, isSecureRequest, json, readJson } from "@/lib/server";
import { serializeCookie } from "@/lib/cookies";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await readJson<{ email?: string; displayName?: string; password?: string; setupCode?: string }>(req);
    const { db } = await getMaverick();
    const user = await createInitialUser(
      db,
      {
        email: String(body.email ?? ""),
        displayName: String(body.displayName ?? ""),
        password: String(body.password ?? ""),
        setupCode: String(body.setupCode ?? ""),
      },
      getSecret("MAVERICK_SETUP_CODE"),
    );
    const { token, expiresAt } = await createSession(db, user.id, {
      ipHash: hashIp(await clientIp()),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    const res = json({ ok: true });
    res.headers.append("Set-Cookie", serializeCookie(SESSION_COOKIE, token, { expires: expiresAt, secure: isSecureRequest(req) }));
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
