import { describe, expect, it } from "vitest";
import {
  LOGIN_MAX_FAILURES,
  changePassword,
  createInitialUser,
  hashPassword,
  listSessions,
  login,
  logout,
  revokeSession,
  validatePasswordStrength,
  validateSession,
  verifyPassword,
} from "../src/auth";
import { listAudit } from "../src/audit";
import { sha256 } from "../src/util/crypto";
import { PASSWORD, SETUP_CODE, freshDb, seedUser } from "./helpers";

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("a long enough password");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("a long enough password", h)).toBe(true);
    expect(await verifyPassword("wrong password here", h)).toBe(false);
  });

  it("enforces minimum strength", () => {
    expect(validatePasswordStrength("short")).toMatch(/at least/);
    expect(validatePasswordStrength("aaaaaaaaaaaaaaa")).toMatch(/repeated/);
    expect(validatePasswordStrength("a perfectly fine passphrase")).toBeNull();
  });
});

describe("first-run setup", () => {
  it("requires the setup code", async () => {
    const db = await freshDb();
    await expect(
      createInitialUser(db, { email: "o@example.com", displayName: "Oliver", password: PASSWORD, setupCode: "wrong" }, SETUP_CODE),
    ).rejects.toMatchObject({ code: "bad_setup_code" });
  });

  it("is disabled when no setup code is configured", async () => {
    const db = await freshDb();
    await expect(
      createInitialUser(db, { email: "o@example.com", displayName: "Oliver", password: PASSWORD, setupCode: "" }, undefined),
    ).rejects.toMatchObject({ code: "setup_disabled" });
  });

  it("allows exactly one account", async () => {
    const db = await freshDb();
    await seedUser(db);
    await expect(
      createInitialUser(db, { email: "intruder@example.com", displayName: "X", password: PASSWORD, setupCode: SETUP_CODE }, SETUP_CODE),
    ).rejects.toMatchObject({ code: "already_setup" });
  });
});

describe("login and sessions", () => {
  it("logs in, validates the session, and logs out", async () => {
    const db = await freshDb();
    await seedUser(db);
    const { token, user } = await login(db, { email: "Oliver@Example.com ", password: PASSWORD, ip: "1.2.3.4" });
    expect(user.displayName).toBe("Oliver");
    expect((await validateSession(db, token))?.id).toBe(user.id);

    // Only a hash of the token is stored.
    const { rows } = await db.query<{ id: string }>("SELECT id FROM sessions");
    expect(rows[0]!.id).toBe(sha256(token));
    expect(rows[0]!.id).not.toBe(token);

    await logout(db, token, user.id);
    expect(await validateSession(db, token)).toBeNull();
  });

  it("rejects wrong passwords and unknown emails with the same message", async () => {
    const db = await freshDb();
    await seedUser(db);
    const a = await login(db, { email: "oliver@example.com", password: "nope nope nope" }).catch((e) => e);
    const b = await login(db, { email: "nobody@example.com", password: "nope nope nope" }).catch((e) => e);
    expect(a.message).toBe(b.message);
    expect(a.code).toBe("bad_credentials");
  });

  it("locks out after repeated failures", async () => {
    const db = await freshDb();
    await seedUser(db);
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await login(db, { email: "oliver@example.com", password: "wrong wrong wrong", ip: "9.9.9.9" }).catch(() => {});
    }
    // Even the correct password is refused while locked.
    await expect(login(db, { email: "oliver@example.com", password: PASSWORD, ip: "9.9.9.9" })).rejects.toMatchObject({ code: "rate_limited" });
    const actions = (await listAudit(db, "none")).map((e) => e.action);
    expect(actions).toContain("login.locked");
  });

  it("caps failures per email even when the IP keeps changing", async () => {
    const db = await freshDb();
    await seedUser(db);
    for (let i = 0; i < 20; i++) {
      await login(db, { email: "oliver@example.com", password: "wrong wrong wrong", ip: `10.0.0.${i}` }).catch(() => {});
    }
    await expect(login(db, { email: "oliver@example.com", password: PASSWORD, ip: "10.0.1.1" })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("expires sessions", async () => {
    const db = await freshDb();
    await seedUser(db);
    const { token } = await login(db, { email: "oliver@example.com", password: PASSWORD });
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    expect(await validateSession(db, token)).toBeNull();
    expect((await db.query("SELECT * FROM sessions")).rows).toHaveLength(0);
  });

  it("revokes another device's session", async () => {
    const db = await freshDb();
    await seedUser(db);
    const mac = await login(db, { email: "oliver@example.com", password: PASSWORD, userAgent: "Mac" });
    const phone = await login(db, { email: "oliver@example.com", password: PASSWORD, userAgent: "iPhone" });
    const sessions = await listSessions(db, mac.user.id, mac.token);
    expect(sessions).toHaveLength(2);
    const phoneHandle = sessions.find((s) => !s.current)!.id;
    expect(await revokeSession(db, mac.user.id, phoneHandle)).toBe(true);
    expect(await validateSession(db, phone.token)).toBeNull();
    expect(await validateSession(db, mac.token)).not.toBeNull();
  });

  it("changing the password signs out other devices", async () => {
    const db = await freshDb();
    await seedUser(db);
    const mac = await login(db, { email: "oliver@example.com", password: PASSWORD });
    const phone = await login(db, { email: "oliver@example.com", password: PASSWORD });
    await changePassword(db, mac.user.id, PASSWORD, "a brand new long passphrase", mac.token);
    expect(await validateSession(db, phone.token)).toBeNull();
    expect(await validateSession(db, mac.token)).not.toBeNull();
    await expect(login(db, { email: "oliver@example.com", password: PASSWORD })).rejects.toBeTruthy();
  });

  it("ignores garbage tokens", async () => {
    const db = await freshDb();
    expect(await validateSession(db, undefined)).toBeNull();
    expect(await validateSession(db, "x".repeat(500))).toBeNull();
    expect(await validateSession(db, "not-a-real-token")).toBeNull();
  });
});
