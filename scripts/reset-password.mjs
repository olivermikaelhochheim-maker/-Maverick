#!/usr/bin/env node
/**
 * `pnpm reset-password`: set a new password for Maverick's single account.
 *
 * Works only on the computer (or cloud server shell) that holds Maverick's
 * database: having that access is what proves it's you. It also shows which
 * email the account uses, clears the failed-login lockout and signs out every
 * device. Two-step login, if on, stays on.
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireCore = createRequire(path.join(root, "packages", "core", "package.json"));

const env = new Map();
const envPath = path.join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[2]) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
  }
}
const get = (k) => process.env[k] || env.get(k);
const fail = (msg) => {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
};

/** Ask a question; hide what's typed for passwords. */
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else if (s === "\r\n" || s === "\n") rl.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const portInUse = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
    s.setTimeout(800, () => (s.destroy(), resolve(false)));
  });

// Same rules and format as packages/core/src/auth/password.ts.
function strength(pw) {
  if (pw.length < 12) return "Use at least 12 characters.";
  if (pw.length > 256) return "That password is too long.";
  if (/^(.)\1+$/.test(pw)) return "Avoid a single repeated character.";
  const lower = pw.toLowerCase();
  if (["password", "maverick", "123456", "qwerty"].some((w) => lower.includes(w) && pw.length < 16)) return "Avoid common words unless the password is long.";
  return null;
}
function hashPassword(pw) {
  const N = 2 ** 15, R = 8, P = 1;
  const salt = randomBytes(16);
  return new Promise((resolve, reject) =>
    scryptCb(pw, salt, 64, { N, r: R, p: P, maxmem: 256 * N * R }, (err, key) =>
      err ? reject(err) : resolve(`scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`),
    ),
  );
}

console.log("\nReset Maverick's password\n");

// Open the database exactly like the app does.
let db;
const url = get("DATABASE_URL");
if (url) {
  const { Pool } = requireCore("pg");
  const pool = new Pool({ connectionString: url, max: 1 });
  db = { query: (sql, params) => pool.query(sql, params), close: () => pool.end() };
  console.log("  Database: PostgreSQL server (DATABASE_URL)");
} else {
  const dir = get("MAVERICK_DATA_DIR") || path.join(root, "data", "pglite");
  if (!existsSync(dir)) fail(`No Maverick database found at ${dir}. Run this from the maverick folder on the computer where Maverick runs.`);
  // The embedded database can only be opened by one program at a time.
  const port = Number(get("PORT") || 3000);
  if (await portInUse(port)) fail(`Maverick seems to be running (port ${port} is in use). Stop it first: go to its Terminal window and press Ctrl+C. Then run this again.`);
  const { PGlite } = await import(requireCore.resolve("@electric-sql/pglite"));
  const pg = new PGlite(dir);
  db = { query: (sql, params) => pg.query(sql, params), close: () => pg.close() };
  console.log(`  Database: ${dir}`);
}

try {
  const { rows } = await db.query("SELECT id, email, display_name, totp_enabled_at IS NOT NULL AS totp_enabled FROM users ORDER BY created_at LIMIT 1");
  const user = rows[0];
  if (!user) fail("No account exists yet. Open Maverick in the browser and create it with your setup code.");
  console.log(`  Account email: ${user.email}  ← sign in with exactly this address\n`);

  let pw;
  for (;;) {
    pw = await ask("  New password (at least 12 characters): ", { hidden: true });
    const problem = strength(pw);
    if (problem) {
      console.log(`  ${problem}`);
      continue;
    }
    const again = await ask("  Type it again: ", { hidden: true });
    if (again !== pw) {
      console.log("  Those didn't match. Try again.");
      continue;
    }
    break;
  }

  const hash = await hashPassword(pw);
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, user.id]);
  await db.query("DELETE FROM sessions WHERE user_id = $1", [user.id]); // every device signs in again
  await db.query("DELETE FROM auth_attempts WHERE success = false"); // lift any failed-login lockout
  await db.query("INSERT INTO audit_log (user_id, actor, action, details) VALUES ($1, 'user', 'password.reset_local', '{}'::jsonb)", [user.id]);

  console.log("\n  ✓ Password changed. All devices are signed out.");
  if (user.totp_enabled) console.log("  · Two-step login is still on: you'll also need the 6-digit code (or a recovery code).");
  console.log(`  · Start Maverick again (pnpm start) and sign in as ${user.email}.\n`);
} catch (err) {
  fail(`Couldn't reset the password: ${err.message}`);
} finally {
  await db.close();
}
