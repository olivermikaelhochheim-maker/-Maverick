import { SESSION_COOKIE, verifyLoginCode } from "@maverick/core";
import { serializeCookie } from "@/lib/cookies";
import { assertSameOrigin, clientIp, errorResponse, getMaverick, getSessionToken, isSecureRequest, json, readJson } from "@/lib/server";

/** Second step of sign-in: the 6-digit code (or a recovery code). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { code } = await readJson<{ code?: string }>(req);
    const m = await getMaverick();
    const token = await getSessionToken();
    const res = await verifyLoginCode(m.db, m.cipher, token, String(code ?? ""), await clientIp());
    const out = json({ ok: true, usedRecoveryCode: res.usedRecoveryCode, recoveryCodesLeft: res.recoveryCodesLeft });
    // Same token, now with the full 30-day lifetime.
    out.headers.append("Set-Cookie", serializeCookie(SESSION_COOKIE, token!, { expires: res.expiresAt, secure: isSecureRequest(req) }));
    return out;
  } catch (err) {
    return errorResponse(err);
  }
}
