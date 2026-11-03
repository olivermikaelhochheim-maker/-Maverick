import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, hotp, otpauthUri, totpAt, verifyTotp } from "../src/auth/totp";

// RFC 6238 Appendix B test vectors (SHA-1, secret "12345678901234567890").
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(totpAt(RFC_SECRET, 59_000, 8)).toBe("94287082");
    expect(totpAt(RFC_SECRET, 1_111_111_109_000, 8)).toBe("07081804");
    expect(totpAt(RFC_SECRET, 1_234_567_890_000, 8)).toBe("89005924");
    expect(totpAt(RFC_SECRET, 20_000_000_000_000, 8)).toBe("65353130");
  });

  it("matches the RFC 4226 HOTP vectors", () => {
    const k = Buffer.from("12345678901234567890");
    expect([0, 1, 2, 9].map((c) => hotp(k, c))).toEqual(["755224", "287082", "359152", "520489"]);
  });

  it("round-trips base32", () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 7, 8]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it("accepts the current code and one step of clock drift, rejects others and replays", () => {
    const now = 1_700_000_000_000;
    const code = totpAt(RFC_SECRET, now);
    const step = verifyTotp(RFC_SECRET, code, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 30_000), now)).toBe(step! - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 90_000), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, now, step!)).toBeNull(); // replay
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(step);
  });

  it("builds an otpauth URI authenticator apps understand", () => {
    expect(otpauthUri("ABC", "oliver@example.com")).toBe(
      "otpauth://totp/Maverick%3Aoliver%40example.com?secret=ABC&issuer=Maverick&algorithm=SHA1&digits=6&period=30",
    );
  });

  it("generates distinct, readable recovery codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });
});
