import { cookies } from "next/headers";
import { exchangeCode, log, safeEqual } from "@maverick/core";
import { getCurrentUser, getMaverick } from "@/lib/server";

const back = (req: Request, status: string) => {
  const res = new Response(null, { status: 303, headers: { Location: new URL(`/settings?google=${status}#calendar`, req.url).toString() } });
  res.headers.append("Set-Cookie", "mvk_oauth=; Path=/api/integrations/google; HttpOnly; SameSite=Lax; Max-Age=0");
  return res;
};

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.redirect(new URL("/login", req.url), 303);
  const m = await getMaverick();
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return back(req, "denied");
  const [state, verifier] = ((await cookies()).get("mvk_oauth")?.value ?? "").split(".");
  const code = url.searchParams.get("code");
  if (!m.google || !state || !verifier || !code || !safeEqual(state, url.searchParams.get("state") ?? "")) return back(req, "invalid");
  try {
    const { tokens, scopes, email } = await exchangeCode(m.google, code, verifier);
    await m.integrations.save(user.id, "google", { tokens, scopes, accountEmail: email });
    return back(req, "connected");
  } catch (err) {
    log.warn("google_connect_failed", { error: err as Error });
    return back(req, "failed");
  }
}
