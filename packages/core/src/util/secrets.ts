import { execFileSync } from "node:child_process";
import { log } from "./logger";

/**
 * Secret lookup order:
 *   1. Environment variable (or .env file loaded by the app)
 *   2. macOS Keychain, service "maverick", account = the variable name
 *
 * The Keychain is the recommended home for API keys on Oliver's Mac
 * (`pnpm configure` offers to put them there). On Linux/cloud hosts, use the
 * host's secret manager, which exposes secrets as environment variables.
 */
const cache = new Map<string, string | null>();

export function getSecret(name: string): string | undefined {
  const fromEnv = process.env[name];
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  if (cache.has(name)) return cache.get(name) ?? undefined;

  let value: string | null = null;
  if (process.platform === "darwin" && process.env.MAVERICK_DISABLE_KEYCHAIN !== "1") {
    try {
      value = execFileSync("security", ["find-generic-password", "-s", "maverick", "-a", name, "-w"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
    } catch {
      value = null; // not in keychain
    }
  }
  if (value) log.debug("secret_loaded", { name, source: "keychain" });
  cache.set(name, value);
  return value ?? undefined;
}

export function clearSecretCache() {
  cache.clear();
}
