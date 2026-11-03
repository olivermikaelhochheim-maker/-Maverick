import QRCode from "qrcode";
import type { Db } from "../db/types";
import type { FieldCipher } from "../util/crypto";
import { audit } from "../audit";
import { sha256 } from "../util/crypto";
import { UserFacingError } from "../util/errors";
import { LOGIN_MAX_FAILURES, LOGIN_WINDOW_MINUTES, SESSION_TTL_DAYS, hashIp, sessionState, type User } from "./index";
import { verifyPassword } from "./password";
import { generateRecoveryCodes, generateTotpSecret, normaliseRecoveryCode, otpauthUri, verifyTotp } from "./totp";

/**
 * Two-step login: after the password, a 6-digit code from an authenticator app
 * (or a single-use recovery code). Required when Maverick runs on the internet
 * (MAVERICK_REQUIRE_2FA=1); optional otherwise.
 */

export const requireTwoFactor = () => process.env.MAVERICK_REQUIRE_2FA === "1";

type MfaRow = {
  id: string;
  email: string;
  password_hash: string;
  totp_secret_enc: string | null;
  totp_pending_enc: string | null;
  totp_enabled_at: Date | string | null;
  totp_last_step: number | string;
  recovery_codes: string;
};

async function load(db: Db, userId: string): Promise<MfaRow> {
  const { rows } = await db.query<MfaRow>("SELECT * FROM users WHERE id = $1", [userId]);
  if (!rows[0]) throw new UserFacingError("Account not found.", "not_found", 404);
  return rows[0];
}

const hashCode = (c: string) => sha256(`recovery:${normaliseRecoveryCode(c)}`);

async function failures(db: Db, key: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM auth_attempts WHERE key = $1 AND success = false AND created_at > now() - ($2 || ' minutes')::interval`,
    [key, String(LOGIN_WINDOW_MINUTES)],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Check a 6-digit code or a recovery code for this user. Consumes recovery codes
 * and records the TOTP step so the same code can't be used twice.
 */
async function checkSecondFactor(db: Db, cipher: FieldCipher, row: MfaRow, code: string): Promise<"totp" | "recovery" | null> {
  if (!row.totp_secret_enc) return null;
  const secret = cipher.decrypt(row.totp_secret_enc);
  const step = verifyTotp(secret, code, Date.now(), Number(row.totp_last_step));
  if (step !== null) {
    // Conditional update: if two requests race with the same code, only one wins.
    const { rows } = await db.query("UPDATE users SET totp_last_step = $1 WHERE id = $2 AND totp_last_step < $1 RETURNING id", [step, row.id]);
    return rows.length ? "totp" : null;
  }
  const hashes = JSON.parse(row.recovery_codes) as string[];
  const h = hashCode(code);
  if (normaliseRecoveryCode(code).length === 8 && hashes.includes(h)) {
    await db.query("UPDATE users SET recovery_codes = $1 WHERE id = $2", [JSON.stringify(hashes.filter((x) => x !== h)), row.id]);
    return "recovery";
  }
  return null;
}

/** Second step of sign-in: turns a password-only session into a full one. */
export async function verifyLoginCode(
  db: Db,
  cipher: FieldCipher,
  token: string | undefined,
  code: string,
  ip?: string | null,
): Promise<{ user: User; expiresAt: Date; usedRecoveryCode: boolean; recoveryCodesLeft: number }> {
  const state = await sessionState(db, token);
  if (!state) throw new UserFacingError("Your sign-in expired. Enter your password again.", "unauthenticated", 401);
  if (state.mfaVerified) throw new UserFacingError("Already signed in.", "already_verified", 409);
  const key = sha256(`mfa:${state.user.id}`);
  const ipHash = hashIp(ip);
  if ((await failures(db, key)) >= LOGIN_MAX_FAILURES) {
    await audit(db, { userId: state.user.id, actor: "system", action: "login.code_locked", ipHash });
    throw new UserFacingError(`Too many wrong codes. Try again in ${LOGIN_WINDOW_MINUTES} minutes.`, "rate_limited", 429);
  }
  const row = await load(db, state.user.id);
  const kind = await checkSecondFactor(db, cipher, row, code);
  await db.query("INSERT INTO auth_attempts (key, success) VALUES ($1, $2)", [key, kind !== null]);
  if (!kind) {
    await audit(db, { userId: row.id, actor: "system", action: "login.code_failed", ipHash });
    throw new UserFacingError("That code isn't right. Use the current 6-digit code from your authenticator app.", "bad_code", 401);
  }
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.query("UPDATE sessions SET mfa_verified = true, expires_at = $1 WHERE id = $2", [expiresAt.toISOString(), sha256(token!)]);
  await audit(db, { userId: row.id, actor: "user", action: kind === "recovery" ? "login.succeeded_recovery_code" : "login.succeeded", ipHash });
  const left = (JSON.parse((await load(db, row.id)).recovery_codes) as string[]).length;
  return { user: state.user, expiresAt, usedRecoveryCode: kind === "recovery", recoveryCodesLeft: left };
}

/** Step 1 of turning on two-step login: a new secret, shown as a QR code. Nothing changes until confirmed. */
export async function beginTwoFactorSetup(db: Db, cipher: FieldCipher, user: User): Promise<{ secret: string; uri: string; qrSvg: string }> {
  const row = await load(db, user.id);
  if (row.totp_enabled_at) throw new UserFacingError("Two-step login is already on.", "already_enabled", 409);
  const secret = generateTotpSecret();
  await db.query("UPDATE users SET totp_pending_enc = $1 WHERE id = $2", [cipher.encrypt(secret), user.id]);
  const uri = otpauthUri(secret, user.email);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  return { secret, uri, qrSvg };
}

/** Step 2: Oliver types a code from the app to prove it's set up. Returns recovery codes, shown once. */
export async function confirmTwoFactorSetup(db: Db, cipher: FieldCipher, userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
  const row = await load(db, userId);
  if (row.totp_enabled_at) throw new UserFacingError("Two-step login is already on.", "already_enabled", 409);
  if (!row.totp_pending_enc) throw new UserFacingError("Start the setup again.", "no_pending_setup");
  const secret = cipher.decrypt(row.totp_pending_enc);
  const step = verifyTotp(secret, code);
  if (step === null) throw new UserFacingError("That code isn't right. Check your phone's clock is set automatically, and use the current code.", "bad_code");
  const recoveryCodes = generateRecoveryCodes();
  await db.query(
    `UPDATE users SET totp_secret_enc = $1, totp_pending_enc = NULL, totp_enabled_at = now(), totp_last_step = $2, recovery_codes = $3 WHERE id = $4`,
    [cipher.encrypt(secret), step, JSON.stringify(recoveryCodes.map(hashCode)), userId],
  );
  await audit(db, { userId, actor: "user", action: "two_factor.enabled" });
  return { recoveryCodes };
}

/** Turn two-step login off (needs password and a current code). Not allowed where it's required. */
export async function disableTwoFactor(db: Db, cipher: FieldCipher, userId: string, password: string, code: string): Promise<void> {
  if (requireTwoFactor()) throw new UserFacingError("Two-step login is required on this server and can't be turned off.", "required", 403);
  const row = await load(db, userId);
  if (!row.totp_enabled_at) return;
  if (!(await verifyPassword(password, row.password_hash))) throw new UserFacingError("Password is incorrect.", "bad_credentials", 401);
  if (!(await checkSecondFactor(db, cipher, row, code))) throw new UserFacingError("That code isn't right.", "bad_code", 401);
  await db.query(
    "UPDATE users SET totp_secret_enc = NULL, totp_pending_enc = NULL, totp_enabled_at = NULL, totp_last_step = -1, recovery_codes = '[]' WHERE id = $1",
    [userId],
  );
  await audit(db, { userId, actor: "user", action: "two_factor.disabled" });
}

/** New set of recovery codes (the old ones stop working). Needs a current code. */
export async function regenerateRecoveryCodes(db: Db, cipher: FieldCipher, userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
  const row = await load(db, userId);
  if (!row.totp_enabled_at) throw new UserFacingError("Two-step login is off.", "not_enabled");
  if ((await checkSecondFactor(db, cipher, row, code)) !== "totp") throw new UserFacingError("Enter the current 6-digit code from your app.", "bad_code", 401);
  const recoveryCodes = generateRecoveryCodes();
  await db.query("UPDATE users SET recovery_codes = $1 WHERE id = $2", [JSON.stringify(recoveryCodes.map(hashCode)), userId]);
  await audit(db, { userId, actor: "user", action: "two_factor.recovery_codes_regenerated" });
  return { recoveryCodes };
}

export async function recoveryCodesLeft(db: Db, userId: string): Promise<number> {
  return (JSON.parse((await load(db, userId)).recovery_codes) as string[]).length;
}
