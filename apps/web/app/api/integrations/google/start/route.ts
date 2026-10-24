import { buildAuthUrl, pkcePair, randomToken } from "@maverick/core";
import { getCurrentUser, getMaverick, isSecureRequest } from "@/lib/server";

/** Begin Google sign-in (OAuth + PKCE). The state and verifier live in a short-lived httpOnly cookie. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.redirect(new URL("/login", req.url), 303);
  const m = await getMaverick();
  if (!m.google) return Response.redirect(new URL("/settings?google=not_configured", req.url), 303);
  const state = randomToken(24);
  const { verifier, challenge } = pkcePair();
  const res = new Response(null, { status: 303, headers: { Location: buildAuthUrl(m.google, state, challenge) } });
  res.headers.append(
    "Set-Cookie",
    `mvk_oauth=${state}.${verifier}; Path=/api/integrations/google; HttpOnly; SameSite=Lax; Max-Age=600${isSecureRequest(req) ? "; Secure" : ""}`,
  );
  return res;
}
