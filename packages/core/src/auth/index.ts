import { randomUUID } from "node:crypto";
import type { Db } from "../db/types";
import { audit } from "../audit";
import { randomToken, safeEqual, sha256 } from "../util/crypto";
import { UserFacingError } from "../util/errors";
import { hashPassword, validatePasswordStrength, verifyPassword } from "./password";

export { hashPassword, verifyPassword, validatePasswordStrength, PASSWORD_MIN_LENGTH } from "./password";

export const SESSION_COOKIE = "mvk_session";
export const SESSION_TTL_DAYS = 30;

/** Max failed logins per email+IP within the window before locking out. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MINUTES = 15;
/** Max failed logins per email from all IPs combined (stops IP-rotation guessing). */
export const LOGIN_MAX_FAILURES_PER_EMAIL = 20;

export interface User {
  id: string;
  email: string;
  displayName: string;
}

type UserRow = { id: string; email: string; display_name: string; password_hash: string };

const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, displayName: r.display_name });

export function hashIp(ip: string | null | undefined): string | undefined {
  return ip ? sha256(`ip:${ip}`).slice(0, 16) : undefined;
}

export async function userCount(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: number | string }>("SELECT count(*)::int AS n FROM users");
  return Number(rows[0]?.n ?? 0);
}

/**
 * First-run account creation. Maverick is single-user: once an account exists,
 * this refuses. The setup code (from .env, printed by `pnpm configure`) stops anyone
 * else on the network from claiming the account first.
 */
export async function createInitialUser(
  db: Db,
  input: { email: string; displayName: string; password: string; setupCode: string },
  expectedSetupCode: string | undefined,
): Promise<User> {
  if (!expectedSetupCode) {
    throw new UserFacingError("Setup is disabled: MAVERICK_SETUP_CODE is not configured. Run `pnpm configure`.", "setup_disabled", 403);
  }
  if (!safeEqual(input.setupCode.trim(), expectedSetupCode)) {
    await audit(db, { actor: "system", action: "setup.rejected", details: { reason: "bad_setup_code" } });
    throw new UserFacingError("That setup code is not correct.", "bad_setup_code", 403);
  }
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserFacingError("Enter a valid email address.", "bad_email");
  const displayName = input.displayName.trim() || "Oliver";
  const weakness = validatePasswordStrength(input.password);
  if (weakness) throw new UserFacingError(weakness, "weak_password");

  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    if ((await userCount(tx)) > 0) {
      throw new UserFacingError("An account already exists. Sign in instead.", "already_setup", 409);
    }
    const id = randomUUID();
    await tx.query("INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)", [
      id,
      email,
      displayName,
      passwordHash,
    ]);
    await audit(tx, { userId: id, actor: "user", action: "account.created" });
    return { id, email, displayName };
  });
}

async function recentFailures(db: Db, key: string): Promise<number> {
  const { rows } = await db.query<{ n: number | string }>(
    `SELECT count(*)::int AS n FROM auth_attempts
     WHERE key = $1 AND success = false AND created_at > now() - ($2 || ' minutes')::interval`,
    [key, String(LOGIN_WINDOW_MINUTES)],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function login(
  db: Db,
  input: { email: string; password: string; ip?: string | null; userAgent?: string | null },
): Promise<{ user: User; token: string; expiresAt: Date }> {
  const email = input.email.trim().toLowerCase();
  const ipHash = hashIp(input.ip);
  const key = sha256(`login:${email}:${ipHash ?? "-"}`);
  const emailKey = sha256(`login-email:${email}`);

  if (
    (await recentFailures(db, key)) >= LOGIN_MAX_FAILURES ||
    (await recentFailures(db, emailKey)) >= LOGIN_MAX_FAILURES_PER_EMAIL
  ) {
    await audit(db, { actor: "system", action: "login.locked", ipHash });
    throw new UserFacingError(
      `Too many failed attempts. Try again in ${LOGIN_WINDOW_MINUTES} minutes.`,
      "rate_limited",
      429,
    );
  }

  const { rows } = await db.query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
  const row = rows[0];
  // Always run a hash comparison so response time doesn't reveal whether the email exists.
  const ok = row
    ? await verifyPassword(input.password, row.password_hash)
    : (await verifyPassword(input.password, DUMMY_HASH), false);

  await db.query("INSERT INTO auth_attempts (key, success) VALUES ($1, $2), ($3, $2)", [key, ok, emailKey]);
  if (!row || !ok) {
    await audit(db, { userId: row?.id ?? null, actor: "system", action: "login.failed", ipHash });
    throw new UserFacingError("Email or password is incorrect.", "bad_credentials", 401);
  }

  const { token, expiresAt } = await createSession(db, row.id, { ipHash, userAgent: input.userAgent ?? undefined });
  await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [row.id]);
  await audit(db, { userId: row.id, actor: "user", action: "login.succeeded", ipHash });
  return { user: toUser(row), token, expiresAt };
}

// A valid hash of a random string, used to equalise timing for unknown emails.
const DUMMY_HASH =
  "scrypt$32768$8$1$c2FsdHNhbHRzYWx0c2FsdA==$" + Buffer.alloc(64, 1).toString("base64");

export async function createSession(
  db: Db,
  userId: string,
  meta: { ipHash?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.query(
    "INSERT INTO sessions (id, user_id, expires_at, user_agent, ip_hash) VALUES ($1, $2, $3, $4, $5)",
    [sha256(token), userId, expiresAt.toISOString(), meta.userAgent?.slice(0, 200) ?? null, meta.ipHash ?? null],
  );
  return { token, expiresAt };
}

/** Resolve a session cookie to a user. Expired sessions are deleted. */
export async function validateSession(db: Db, token: string | undefined | null): Promise<User | null> {
  if (!token || token.length > 200) return null;
  const id = sha256(token);
  const { rows } = await db.query<UserRow & { expires_at: Date | string; last_seen_at: Date | string }>(
    `SELECT u.*, s.expires_at, s.last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.query("DELETE FROM sessions WHERE id = $1", [id]);
    return null;
  }
  // Touch at most every 5 minutes to avoid a write per request.
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    await db.query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [id]);
  }
  return toUser(row);
}

export async function logout(db: Db, token: string | undefined | null, userId?: string): Promise<void> {
  if (!token) return;
  await db.query("DELETE FROM sessions WHERE id = $1", [sha256(token)]);
  if (userId) await audit(db, { userId, actor: "user", action: "logout" });
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  current: boolean;
}

export async function listSessions(db: Db, userId: string, currentToken?: string): Promise<SessionInfo[]> {
  const current = currentToken ? sha256(currentToken) : null;
  const { rows } = await db.query<{
    id: string;
    created_at: Date | string;
    last_seen_at: Date | string;
    expires_at: Date | string;
    user_agent: string | null;
  }>("SELECT id, created_at, last_seen_at, expires_at, user_agent FROM sessions WHERE user_id = $1 ORDER BY last_seen_at DESC", [
    userId,
  ]);
  return rows.map((r) => ({
    // Expose only a prefix of the hash as a handle; never the token.
    id: r.id.slice(0, 16),
    createdAt: new Date(r.created_at).toISOString(),
    lastSeenAt: new Date(r.last_seen_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
    userAgent: r.user_agent,
    current: r.id === current,
  }));
}

export async function revokeSession(db: Db, userId: string, handle: string): Promise<boolean> {
  if (!/^[0-9a-f]{16}$/.test(handle)) return false;
  const { rows } = await db.query<{ id: string }>(
    "DELETE FROM sessions WHERE user_id = $1 AND substr(id, 1, 16) = $2 RETURNING id",
    [userId, handle],
  );
  if (rows.length) await audit(db, { userId, actor: "user", action: "session.revoked", target: handle });
  return rows.length > 0;
}

export async function revokeOtherSessions(db: Db, userId: string, currentToken: string): Promise<number> {
  const { rows } = await db.query<{ id: string }>("DELETE FROM sessions WHERE user_id = $1 AND id <> $2 RETURNING id", [
    userId,
    sha256(currentToken),
  ]);
  await audit(db, { userId, actor: "user", action: "session.revoked_others", details: { count: rows.length } });
  return rows.length;
}

export async function changePassword(
  db: Db,
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentToken: string,
): Promise<void> {
  const { rows } = await db.query<UserRow>("SELECT * FROM users WHERE id = $1", [userId]);
  const row = rows[0];
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw new UserFacingError("Current password is incorrect.", "bad_credentials", 401);
  }
  const weakness = validatePasswordStrength(newPassword);
  if (weakness) throw new UserFacingError(weakness, "weak_password");
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await hashPassword(newPassword), userId]);
  // Changing the password signs out every other device.
  await db.query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [userId, sha256(currentToken)]);
  await audit(db, { userId, actor: "user", action: "password.changed" });
}
