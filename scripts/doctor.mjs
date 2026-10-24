#!/usr/bin/env node
/** `pnpm check`: plain-language health check of a Maverick install. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let problems = 0;
const ok = (s) => console.log(`  \x1b[36m✓\x1b[0m ${s}`);
const bad = (s, fix) => {
  problems++;
  console.log(`  \x1b[31m✗\x1b[0m ${s}${fix ? `\n      → ${fix}` : ""}`);
};
const info = (s) => console.log(`  · ${s}`);

const env = new Map();
const envPath = path.join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[2]) env.set(m[1], m[2]);
  }
}
const keychain = (name) => {
  if (process.platform !== "darwin") return false;
  try {
    execFileSync("security", ["find-generic-password", "-s", "maverick", "-a", name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const where = (name) => (process.env[name] || env.get(name) ? ".env" : keychain(name) ? "Keychain" : null);

console.log("\nMaverick doctor\n");
const [major] = process.versions.node.split(".").map(Number);
major >= 22 ? ok(`Node.js ${process.versions.node}`) : bad(`Node.js ${process.versions.node} is too old`, "Install Node 22+ (README step 1)");
existsSync(path.join(root, "node_modules")) ? ok("Dependencies installed") : bad("Dependencies missing", "Run: pnpm install");
if (existsSync(envPath)) {
  ok(".env present");
  if ((statSync(envPath).mode & 0o077) !== 0) bad(".env is readable by other users", "Run: chmod 600 .env");
} else bad("No .env file", "Run: pnpm configure");

const dk = where("MAVERICK_DATA_KEY");
dk ? ok(`Data encryption key (${dk})`) : bad("No data encryption key", "Run: pnpm configure");
env.get("MAVERICK_SETUP_CODE") ? ok("Setup code configured") : bad("No setup code", "Run: pnpm configure");
const ak = where("ANTHROPIC_API_KEY");
const forcedMock = (env.get("MAVERICK_LLM_PROVIDER") ?? process.env.MAVERICK_LLM_PROVIDER) === "mock";
if (forcedMock) info("AI: mock mode forced by MAVERICK_LLM_PROVIDER=mock");
else if (ak) ok(`Anthropic API key (${ak}): live mode`);
else info("No Anthropic API key: Maverick will run in free mock mode");
info(`Database: ${env.get("DATABASE_URL") ? "PostgreSQL server (DATABASE_URL)" : `embedded, in ${env.get("MAVERICK_DATA_DIR") ?? "data/pglite"}`}`);

await new Promise((resolve) => {
  const srv = net.createServer();
  srv.once("error", () => {
    info("Port 3000 is in use (Maverick may already be running, which is fine)");
    resolve();
  });
  srv.once("listening", () => srv.close(() => (ok("Port 3000 is free"), resolve())));
  srv.listen(3000, "0.0.0.0");
});

console.log(problems ? `\n${problems} problem(s) found.\n` : "\nAll good. Start with: pnpm dev\n");
process.exit(problems ? 1 : 0);
