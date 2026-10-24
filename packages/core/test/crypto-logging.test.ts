import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { FieldCipher } from "../src/util/crypto";
import { redact, redactString } from "../src/util/logger";

describe("field encryption", () => {
  const cipher = new FieldCipher(randomBytes(32).toString("base64"));

  it("round-trips text, including unicode", () => {
    const msg = "Revenue target: $100k/month — confidential ✈️";
    const enc = cipher.encrypt(msg);
    expect(enc).not.toContain("Revenue");
    expect(cipher.decrypt(enc)).toBe(msg);
  });

  it("uses a fresh IV each time", () => {
    expect(cipher.encrypt("same")).not.toBe(cipher.encrypt("same"));
  });

  it("rejects tampered ciphertext", () => {
    const enc = cipher.encrypt("hello");
    const parts = enc.split(":");
    const ct = Buffer.from(parts[3]!, "base64");
    ct[0] = ct[0]! ^ 0xff;
    parts[3] = ct.toString("base64");
    expect(() => cipher.decrypt(parts.join(":"))).toThrow();
  });

  it("rejects a different key", () => {
    const other = new FieldCipher(randomBytes(32).toString("base64"));
    expect(() => other.decrypt(cipher.encrypt("secret"))).toThrow();
  });

  it("refuses keys of the wrong length", () => {
    expect(() => new FieldCipher(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("log redaction", () => {
  it("redacts sensitive keys recursively", () => {
    const out = redact({ password: "x", nested: { apiKey: "sk-ant-123", content: "private", ok: 1 }, list: [{ token: "t" }] });
    expect(out).toEqual({ password: "[redacted]", nested: { apiKey: "[redacted]", content: "[redacted]", ok: 1 }, list: [{ token: "[redacted]" }] });
  });

  it("scrubs key-like strings from free text", () => {
    expect(redactString("failed with sk-ant-api03-abcdefghijk and Bearer abc.def")).toBe("failed with sk-[redacted] and Bearer [redacted]");
  });
});
