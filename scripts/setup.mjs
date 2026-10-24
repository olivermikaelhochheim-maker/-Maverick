#!/usr/bin/env node
/**
 * Maverick first-time setup. Safe to run more than once: it never overwrites
 * existing secrets, it only fills in what's missing.
 *
 *   pnpm configure          interactive
 *   pnpm configure --yes    accept defaults (mock mode, no prompts)
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const auto = process.argv.includes("--yes") || !process.stdin.isTTY;
const isMac = process.platform === "darwin";

const say = (s = "") => console.log(s);
const ok = (s) => say(`  \x1b[36m✓\x1b[0m ${s}`);
const warn = (s) => say(`  \x1b[33m!\x1b[0m ${s}`);

function parseEnv(text) {
  const out = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out.set(m[1], m[2].replace(/^["']|["']$/g, ""));
  }
  return out;
}

function keychainGet(name) {
  if (!isMac) return null;
  try {
    return execFileSync("security", ["find-generic-password", "-s", "maverick", "-a", name, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

function keychainSet(name, value) {
  execFileSync("security", ["add-generic-password", "-U", "-s", "maverick", "-a", name, "-w", value], { stdio: "ignore" });
}

const rl = auto ? null : createInterface({ input: process.stdin, output: process.stdout });
async function ask(q, def = "") {
  if (!rl) return def;
  const a = (await rl.question(`  ${q}${def ? ` [${def}]` : ""}: `)).trim();
  return a || def;
}
async function yesNo(q, def = true) {
  const a = (await ask(`${q} (${def ? "Y/n" : "y/N"})`, "")).toLowerCase();
  return a ? a.startsWith("y") : def;
}

say("\n\x1b[1mMaverick setup\x1b[0m\n");

const [major] = process.versions.node.split(".").map(Number);
if (major < 22) {
  say(`Node.js ${process.versions.node} is too old. Install Node 22 or newer (see README, step 1).`);
  process.exit(1);
}
ok(`Node.js ${process.versions.node}`);

const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : readFileSync(path.join(root, ".env.example"), "utf8");
const env = parseEnv(existing);
const has = (k) => Boolean(env.get(k)) || Boolean(keychainGet(k));

// 1. Data encryption key
if (has("MAVERICK_DATA_KEY")) {
  ok("Data encryption key already exists (kept as is)");
} else {
  const key = randomBytes(32).toString("base64");
  const useKeychain = isMac && (await yesNo("Store the data encryption key in the macOS Keychain (recommended)?", true));
  if (useKeychain) {
    keychainSet("MAVERICK_DATA_KEY", key);
    env.set("MAVERICK_DATA_KEY", "");
    ok("Data encryption key created and stored in the Keychain");
  } else {
    env.set("MAVERICK_DATA_KEY", key);
    ok("Data encryption key created and stored in .env");
  }
  warn("Back this key up in your password manager. Without it, stored conversations can't be decrypted.");
  if (!useKeychain) say(`      MAVERICK_DATA_KEY=${key}`);
  else say("      (View it later in Keychain Access → search \"maverick\".)");
}

// 2. Setup code
if (!env.get("MAVERICK_SETUP_CODE")) {
  const raw = randomBytes(9).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "X");
  env.set("MAVERICK_SETUP_CODE", `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`);
}
ok("One-time setup code ready");

// 3. Data directory
if (!env.get("MAVERICK_DATA_DIR")) env.set("MAVERICK_DATA_DIR", path.join(root, "data", "pglite"));
ok(`Database folder: ${env.get("MAVERICK_DATA_DIR")}`);

// 4. Anthropic API key
if (has("ANTHROPIC_API_KEY")) {
  ok("Anthropic API key found (live mode)");
} else {
  say("\n  Maverick needs an Anthropic API key to think. Without one it runs in free mock mode.");
  say("  Get one at https://console.anthropic.com → API Keys. Set a monthly spend limit there too.");
  const key = await ask("Paste your API key now, or press Enter to stay in mock mode", "");
  if (key) {
    if (!key.startsWith("sk-ant-")) warn("That doesn't look like an Anthropic key (they start with sk-ant-). Saving it anyway.");
    if (isMac && (await yesNo("Store it in the macOS Keychain (recommended)?", true))) {
      keychainSet("ANTHROPIC_API_KEY", key);
      env.set("ANTHROPIC_API_KEY", "");
      ok("API key stored in the Keychain");
    } else {
      env.set("ANTHROPIC_API_KEY", key);
      ok("API key stored in .env");
    }
  } else {
    ok("Mock mode for now. Re-run `pnpm configure` any time to add a key.");
  }
}

// Write .env, preserving the example's comments and order.
const template = readFileSync(path.join(root, ".env.example"), "utf8");
const seen = new Set();
let out = template
  .split("\n")
  .map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (!m) return line;
    seen.add(m[1]);
    return `${m[1]}=${env.get(m[1]) ?? ""}`;
  })
  .join("\n");
for (const [k, v] of env) if (!seen.has(k)) out += `\n${k}=${v}`;
writeFileSync(envPath, out.endsWith("\n") ? out : out + "\n", { mode: 0o600 });
chmodSync(envPath, 0o600);
ok(".env written (readable only by your user account)");

rl?.close();
say(`
\x1b[1mDone.\x1b[0m Next:

  1. Start Maverick:    pnpm dev
  2. Open:              http://localhost:3000
  3. Create your account with this setup code:

        \x1b[1;36m${env.get("MAVERICK_SETUP_CODE")}\x1b[0m
`);
