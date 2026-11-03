import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMaverick } from "./maverick";
import {
  SESSION_COOKIE,
  UserFacingError,
  requireTwoFactor,
  log,
  validateSession,
  type Maverick,
  type User,
} from "@maverick/core";

export { getMaverick };

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function getCurrentUser(): Promise<User | null> {
  const { db } = await getMaverick();
  return validateSession(db, await getSessionToken());
}

/**
 * For pages: send signed-out visitors to the login screen, and (on the cloud server)
 * send anyone without two-step login to set it up before anything else.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (requireTwoFactor() && !user.totpEnabled) redirect("/two-factor");
  return user;
}

/**
 * Client IP, used only (hashed) for login rate limiting and the audit log.
 * Forwarded headers are trusted only when MAVERICK_TRUST_PROXY=1, i.e. when
 * running behind a known reverse proxy (the cloud host). We take the LAST
 * X-Forwarded-For entry: the one the host's proxy appended. Earlier entries
 * can be written by the client and would let an attacker dodge the lockout.
 */
export async function clientIp(): Promise<string | null> {
  if (process.env.MAVERICK_TRUST_PROXY !== "1") return "direct";
  const h = await headers();
  const chain = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return chain.at(-1) || h.get("x-real-ip") || null;
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof UserFacingError) return json({ error: err.message, code: err.code }, err.status);
  log.error("api_error", { error: err as Error });
  return json({ error: "Something went wrong on Maverick's side. The error was logged.", code: "internal" }, 500);
}

/**
 * CSRF defence for state-changing requests: the Origin header must match the
 * host the request was sent to. Combined with SameSite=Lax cookies this blocks
 * cross-site form posts and fetches.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new UserFacingError("Missing origin.", "bad_origin", 403);
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new UserFacingError("Bad origin.", "bad_origin", 403);
  }
  // Extra origins Oliver explicitly trusts, e.g. his Tailscale https address behind `tailscale serve`.
  const allowed = (process.env.MAVERICK_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (originHost !== host && !allowed.includes(origin.replace(/\/$/, ""))) {
    throw new UserFacingError("Cross-site request blocked.", "bad_origin", 403);
  }
}

/**
 * Authenticated API entry point: origin check (for writes) + fully signed-in session.
 * Where two-step login is required, everything except its own setup is refused until it's on.
 */
export async function apiUser(req: Request, opts: { allowWithoutTwoFactor?: boolean } = {}): Promise<{ maverick: Maverick; user: User; token: string }> {
  if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
  const maverick = await getMaverick();
  const token = await getSessionToken();
  const user = await validateSession(maverick.db, token);
  if (!user || !token) throw new UserFacingError("Please sign in again.", "unauthenticated", 401);
  if (requireTwoFactor() && !user.totpEnabled && !opts.allowWithoutTwoFactor) {
    throw new UserFacingError("Set up two-step login first.", "two_factor_setup_required", 403);
  }
  return { maverick, user, token };
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 64_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new UserFacingError("Request too large.", "too_large", 413);
  try {
    const parsed = JSON.parse(text || "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    return parsed as T;
  } catch {
    throw new UserFacingError("Invalid request body.", "bad_json");
  }
}

export function isSecureRequest(req: Request): boolean {
  if (process.env.MAVERICK_COOKIE_SECURE === "1") return true;
  if (process.env.MAVERICK_COOKIE_SECURE === "0") return false;
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return proto === "https";
}
