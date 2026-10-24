import type { Db } from "./db/types";
import { audit } from "./audit";
import { MODELS } from "./llm/catalog";
import { isValidTimeZone } from "./util/time";
import { UserFacingError } from "./util/errors";
import type { FieldCipher } from "./util/crypto";

export type RoutingMode = "auto" | "fast" | "standard" | "deep";
export type Tier = "fast" | "standard" | "deep";

export interface Settings {
  timezone: string;
  /** Explicit facts Oliver wants Maverick to know. Shown and editable in Settings. */
  aboutMe: string;
  personality: { wit: "low" | "medium" | "high"; directness: "gentle" | "balanced" | "blunt" };
  routing: {
    mode: RoutingMode;
    models: Record<Tier, string>;
    /** How much recent conversation to send per request (estimated tokens). */
    historyTokenBudget: number;
    maxOutputTokens: number;
  };
  budget: {
    /** Warn and drop to the fast tier above this month-to-date spend. */
    monthlySoftUsd: number;
    /** Refuse new model calls above this month-to-date spend. */
    monthlyHardUsd: number;
    dailyHardUsd: number;
  };
  ui: { reduceMotion: boolean };
}

/**
 * Seeded from Oliver's initial brief (2026-10-24). These are facts Oliver
 * stated directly, not model guesses, and they can be edited or cleared in Settings.
 */
export const DEFAULT_ABOUT_ME = `Source: Oliver's initial brief to Maverick, 24 Oct 2026.
- Runs Zorza Marketing. 1-year goal: grow toward $100,000/month (currency and revenue-vs-profit not yet confirmed).
- 3-year goal: learn about and begin stock and real-estate investing when financially appropriate.
- 5-year goal: multiple sustainable income streams and meaningful time freedom.
- Personal goals: pilot's license, financial independence, mental resilience, wisdom, athletic physique.
- Main friction: procrastination, lack of focus, lack of clarity.
- Wants a mentor who is wise, disciplined, reassuring and accountable, never shaming.
- Uses a MacBook and an iPhone.`;

export const DEFAULT_SETTINGS: Settings = {
  timezone: "UTC",
  aboutMe: DEFAULT_ABOUT_ME,
  personality: { wit: "medium", directness: "balanced" },
  routing: {
    mode: "auto",
    models: { fast: "claude-haiku-5-5", standard: "claude-sonnet-5-5", deep: "claude-opus-5-5" },
    historyTokenBudget: 12_000,
    maxOutputTokens: 4_000,
  },
  budget: { monthlySoftUsd: 30, monthlyHardUsd: 40, dailyHardUsd: 5 },
  ui: { reduceMotion: false },
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge stored settings over defaults so new fields get sane values. */
function merge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : (over as T));
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (k in out) out[k] = merge((base as Record<string, unknown>)[k], v);
  }
  return out as T;
}

export function validateSettings(s: Settings): Settings {
  const fail = (msg: string) => {
    throw new UserFacingError(msg, "invalid_settings");
  };
  if (!isValidTimeZone(s.timezone)) fail("Unknown time zone. Use a name like Europe/London.");
  if (typeof s.aboutMe !== "string" || s.aboutMe.length > 8000) fail("'About me' must be under 8,000 characters.");
  if (!["low", "medium", "high"].includes(s.personality.wit)) fail("Invalid wit setting.");
  if (!["gentle", "balanced", "blunt"].includes(s.personality.directness)) fail("Invalid directness setting.");
  if (!["auto", "fast", "standard", "deep"].includes(s.routing.mode)) fail("Invalid routing mode.");
  for (const tier of ["fast", "standard", "deep"] as const) {
    if (!MODELS[s.routing.models[tier]]) fail(`Unknown model for ${tier} tier.`);
  }
  const num = (v: unknown, min: number, max: number, label: string) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail(`${label} must be between ${min} and ${max}.`);
  };
  num(s.routing.historyTokenBudget, 1000, 100_000, "History budget");
  num(s.routing.maxOutputTokens, 256, 32_000, "Max reply length");
  num(s.budget.monthlySoftUsd, 0, 10_000, "Monthly soft limit");
  num(s.budget.monthlyHardUsd, 0, 10_000, "Monthly hard limit");
  num(s.budget.dailyHardUsd, 0, 10_000, "Daily hard limit");
  if (s.budget.monthlySoftUsd > s.budget.monthlyHardUsd) fail("The soft limit must not exceed the hard limit.");
  if (typeof s.ui.reduceMotion !== "boolean") fail("Invalid motion setting.");
  return s;
}

/**
 * Settings contain personal notes ("About me"), so the whole document is
 * encrypted at rest: the row holds {"enc": "<ciphertext>"}.
 */
export async function getSettings(db: Db, cipher: FieldCipher, userId: string): Promise<Settings> {
  const { rows } = await db.query<{ data: unknown }>("SELECT data FROM settings WHERE user_id = $1", [userId]);
  const raw = rows[0]?.data;
  const row = (typeof raw === "string" ? JSON.parse(raw) : raw) as { enc?: string } | undefined;
  const stored = row?.enc ? JSON.parse(cipher.decrypt(row.enc)) : {};
  return merge(structuredClone(DEFAULT_SETTINGS), stored);
}

export async function updateSettings(db: Db, cipher: FieldCipher, userId: string, patch: unknown): Promise<Settings> {
  const before = await getSettings(db, cipher, userId);
  const next = validateSettings(merge(structuredClone(before), patch));
  await db.query(
    `INSERT INTO settings (user_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [userId, JSON.stringify({ enc: cipher.encrypt(JSON.stringify(next)) })],
  );
  const changed: string[] = [];
  for (const key of Object.keys(next) as (keyof Settings)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(before[key])) changed.push(key);
  }
  const details: Record<string, unknown> = { changed };
  if (changed.includes("budget")) details.budget = next.budget; // budget changes are worth recording in full
  await audit(db, { userId, actor: "user", action: "settings.updated", details });
  return next;
}
