import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Field-level encryption for sensitive data at rest (AES-256-GCM).
 *
 * Format: "v1:<iv b64>:<auth tag b64>:<ciphertext b64>". GCM authenticates the
 * ciphertext, so any tampering makes decryption throw rather than return junk.
 */
export class FieldCipher {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64, "base64");
    if (key.length !== 32) {
      throw new Error("MAVERICK_DATA_KEY must be 32 bytes, base64-encoded. Run `pnpm configure` to generate one.");
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
  }

  decrypt(payload: string): string {
    const parts = payload.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unrecognised ciphertext format");
    const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  }
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(sha256(a));
  const bb = Buffer.from(sha256(b));
  return timingSafeEqual(ab, bb);
}
