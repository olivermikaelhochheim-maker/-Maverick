import { afterEach, describe, expect, it } from "vitest";
import { listSessions, login, validateSession } from "../src/auth";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  recoveryCodesLeft,
  regenerateRecoveryCodes,
  verifyLoginCode,
} from "../src/auth/mfa";
import { totpAt } from "../src/auth/totp";
import { PASSWORD, freshDb, seedUser, testCipher } from "./helpers";

async function withTwoFactor() {
  const db = await freshDb();
  const user = await seedUser(db);
  const cipher = testCipher();
  const { secret, qrSvg, uri } = await beginTwoFactorSetup(db, cipher, user);
  expect(qrSvg).toContain("<svg");
  expect(uri).toContain(`secret=${secret}`);
  // Confirm with the previous step's code so later "current" codes aren't replays.
  const { recoveryCodes } = await confirmTwoFactorSetup(db, cipher, user.id, totpAt(secret, Date.now() - 30_000));
  return { db, user, cipher, secret, recoveryCodes };
}

afterEach(() => {
  delete process.env.MAVERICK_REQUIRE_2FA;
});

describe("two-step login", () => {
  it("setup needs a correct code before anything changes, and stores the secret encrypted", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    const cipher = testCipher();
    const { secret } = await beginTwoFactorSetup(db, cipher, user);
    await expect(confirmTwoFactorSetup(db, cipher, user.id, "000000")).rejects.toMatchObject({ code: "bad_code" });
    expect((await login(db, { email: "oliver@example.com", password: PASSWORD })).mfaRequired).toBe(false);
    await confirmTwoFactorSetup(db, cipher, user.id, totpAt(secret, Date.now()));
    const raw = await db.query<{ totp_secret_enc: string; recovery_codes: string }>("SELECT totp_secret_enc, recovery_codes FROM users");
    expect(raw.rows[0]!.totp_secret_enc).not.toContain(secret);
    expect(raw.rows[0]!.recovery_codes).not.toMatch(/[A-Z0-9]{4}-[A-Z0-9]{4}/); // only hashes stored
  });

  it("with it on, the password alone gives a session that can do nothing until the code", async () => {
    const { db, cipher, secret } = await withTwoFactor();
    const res = await login(db, { email: "oliver@example.com", password: PASSWORD });
    expect(res.mfaRequired).toBe(true);
    expect(await validateSession(db, res.token)).toBeNull();
    expect(res.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60_000 + 1000);
    expect(await listSessions(db, res.user.id)).toHaveLength(0); // not listed as a signed-in device

    const ok = await verifyLoginCode(db, cipher, res.token, totpAt(secret, Date.now()));
    expect(ok.usedRecoveryCode).toBe(false);
    expect((await validateSession(db, res.token))?.totpEnabled).toBe(true);
  });

  it("rejects wrong codes, replays, and locks out after repeated failures", async () => {
    const { db, cipher, secret } = await withTwoFactor();
    const a = await login(db, { email: "oliver@example.com", password: PASSWORD });
    const code = totpAt(secret, Date.now());
    await verifyLoginCode(db, cipher, a.token, code);
    // Same code on a second device: replay.
    const b = await login(db, { email: "oliver@example.com", password: PASSWORD });
    await expect(verifyLoginCode(db, cipher, b.token, code)).rejects.toMatchObject({ code: "bad_code" });
    for (let i = 0; i < 4; i++) await verifyLoginCode(db, cipher, b.token, "123456").catch(() => {});
    await expect(verifyLoginCode(db, cipher, b.token, totpAt(secret, Date.now() + 30_000))).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("recovery codes work once each", async () => {
    const { db, cipher, user, recoveryCodes } = await withTwoFactor();
    expect(recoveryCodes).toHaveLength(10);
    const a = await login(db, { email: "oliver@example.com", password: PASSWORD });
    const res = await verifyLoginCode(db, cipher, a.token, recoveryCodes[0]!.toLowerCase().replace("-", " "));
    expect(res).toMatchObject({ usedRecoveryCode: true, recoveryCodesLeft: 9 });
    const b = await login(db, { email: "oliver@example.com", password: PASSWORD });
    await expect(verifyLoginCode(db, cipher, b.token, recoveryCodes[0]!)).rejects.toMatchObject({ code: "bad_code" });
    expect(await recoveryCodesLeft(db, user.id)).toBe(9);
  });

  it("regenerating recovery codes invalidates the old ones", async () => {
    const { db, cipher, user, secret, recoveryCodes } = await withTwoFactor();
    const { recoveryCodes: fresh } = await regenerateRecoveryCodes(db, cipher, user.id, totpAt(secret, Date.now()));
    const a = await login(db, { email: "oliver@example.com", password: PASSWORD });
    await expect(verifyLoginCode(db, cipher, a.token, recoveryCodes[1]!)).rejects.toMatchObject({ code: "bad_code" });
    await verifyLoginCode(db, cipher, a.token, fresh[0]!);
  });

  it("turning it off needs password and code, and is blocked where it's required", async () => {
    const { db, cipher, user, secret } = await withTwoFactor();
    process.env.MAVERICK_REQUIRE_2FA = "1";
    await expect(disableTwoFactor(db, cipher, user.id, PASSWORD, totpAt(secret, Date.now()))).rejects.toMatchObject({ code: "required" });
    delete process.env.MAVERICK_REQUIRE_2FA;
    await expect(disableTwoFactor(db, cipher, user.id, "wrong password!!", totpAt(secret, Date.now()))).rejects.toMatchObject({ code: "bad_credentials" });
    await disableTwoFactor(db, cipher, user.id, PASSWORD, totpAt(secret, Date.now()));
    expect((await login(db, { email: "oliver@example.com", password: PASSWORD })).mfaRequired).toBe(false);
  });
});
