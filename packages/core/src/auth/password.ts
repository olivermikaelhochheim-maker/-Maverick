import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with scrypt (memory-hard, built into Node).
 * Stored format: scrypt$N$r$p$<salt b64>$<hash b64>
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEYLEN, { N: n, r, p, maxmem: 256 * n * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export const PASSWORD_MIN_LENGTH = 12;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > 256) return "That password is too long.";
  if (/^(.)\1+$/.test(password)) return "Avoid a single repeated character.";
  const lowered = password.toLowerCase();
  if (["password", "maverick", "123456", "qwerty"].some((w) => lowered.includes(w) && password.length < 16)) {
    return "Avoid common words unless the password is long.";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
