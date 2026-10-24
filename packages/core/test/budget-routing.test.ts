import { describe, expect, it } from "vitest";
import { getSpend, planCall, recordUsage } from "../src/budget";
import { MODELS, costUsd } from "../src/llm/catalog";
import { routeMessage } from "../src/llm/router";
import { DEFAULT_SETTINGS, getSettings, updateSettings } from "../src/settings";
import { freshDb, seedUser, testCipher } from "./helpers";

const sonnet = MODELS["claude-sonnet-5-5"]!.price;

const spend = (monthUsd: number, todayUsd = 0) => ({
  monthUsd,
  todayUsd,
  monthSoftUsd: 30,
  monthHardUsd: 40,
  dailyHardUsd: 5,
  softLimitReached: monthUsd >= 30,
  hardLimitReached: monthUsd >= 40 || todayUsd >= 5,
  monthFraction: monthUsd / 40,
  periodStart: "",
});

describe("cost calculation", () => {
  it("prices tokens per million", () => {
    expect(costUsd(sonnet, { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(2);
    expect(costUsd(sonnet, { inputTokens: 0, outputTokens: 1_000_000 })).toBeCloseTo(10);
    expect(costUsd(sonnet, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 })).toBeCloseTo(0.2);
  });
});

describe("budget enforcement", () => {
  it("allows a normal call with the requested length", () => {
    const plan = planCall(spend(1), sonnet, 3000, 4000);
    expect(plan.maxOutputTokens).toBe(4000);
  });

  it("refuses when the hard monthly limit is reached", () => {
    expect(() => planCall(spend(40), sonnet, 3000, 4000)).toThrow(/month's hard cap/);
  });

  it("refuses when the daily limit is reached", () => {
    expect(() => planCall(spend(10, 5), sonnet, 3000, 4000)).toThrow(/Today's spending cap/);
  });

  it("shrinks max_tokens so the worst case fits the remaining budget", () => {
    // $0.02 left: input 1000 tok = $0.002, leaving $0.018 = 1800 output tokens
    const plan = planCall(spend(39.98), sonnet, 1000, 4000);
    expect(plan.maxOutputTokens).toBe(1800);
    expect(plan.worstCaseCostUsd).toBeLessThanOrEqual(0.02 + 1e-9);
  });

  it("refuses when not even a short reply would fit", () => {
    expect(() => planCall(spend(39.999), sonnet, 100, 4000)).toThrow();
  });

  it("free models are never blocked", () => {
    const plan = planCall(spend(100, 100), MODELS["mock-maverick"]!.price, 1000, 4000);
    expect(plan.maxOutputTokens).toBe(4000);
  });

  it("sums the ledger for month and today", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    await recordUsage(db, { userId: user.id, provider: "anthropic", model: "claude-sonnet-5-5", usage: { inputTokens: 1_000_000, outputTokens: 0 }, price: sonnet });
    await db.query(
      "INSERT INTO usage_events (id, user_id, provider, model, cost_usd, created_at) VALUES ('old', $1, 'anthropic', 'x', 99, now() - interval '70 days')",
      [user.id],
    );
    const s = await getSpend(db, user.id, DEFAULT_SETTINGS);
    expect(s.monthUsd).toBeCloseTo(2);
    expect(s.todayUsd).toBeCloseTo(2);
  });
});

describe("routing", () => {
  it("uses the fast model for quick exchanges", () => {
    expect(routeMessage("Morning! Quick one: what's 15% of 80?", DEFAULT_SETTINGS).tier).toBe("fast");
  });
  it("escalates analytical questions", () => {
    const r = routeMessage("Should I change my pricing for retainers?", DEFAULT_SETTINGS);
    expect(r.tier).toBe("standard");
    expect(r.model).toBe("claude-sonnet-5-5");
  });
  it("honours 'think deeper'", () => {
    expect(routeMessage("hi", DEFAULT_SETTINGS, { deep: true }).model).toBe("claude-opus-5-5");
  });
  it("drops to fast once the soft limit is reached", () => {
    const r = routeMessage("Analyse my revenue strategy", DEFAULT_SETTINGS, { deep: true, softLimitReached: true });
    expect(r.tier).toBe("fast");
    expect(r.reason).toMatch(/Soft budget/);
  });
  it("respects a fixed mode", () => {
    const s = structuredClone(DEFAULT_SETTINGS);
    s.routing.mode = "standard";
    expect(routeMessage("hi", s).tier).toBe("standard");
  });
});

describe("settings", () => {
  const cipher = testCipher();

  it("merges, validates and audits updates", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    const s = await updateSettings(db, cipher, user.id, { timezone: "Europe/Stockholm", budget: { monthlySoftUsd: 10, monthlyHardUsd: 20 } });
    expect(s.timezone).toBe("Europe/Stockholm");
    expect(s.budget.dailyHardUsd).toBe(DEFAULT_SETTINGS.budget.dailyHardUsd);
    expect((await getSettings(db, cipher, user.id)).budget.monthlyHardUsd).toBe(20);
    const { rows } = await db.query<{ action: string }>("SELECT action FROM audit_log WHERE action = 'settings.updated'");
    expect(rows).toHaveLength(1);
  });

  it("rejects invalid values", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    await expect(updateSettings(db, cipher, user.id, { timezone: "Mars/Olympus" })).rejects.toThrow(/time zone/);
    await expect(updateSettings(db, cipher, user.id, { budget: { monthlySoftUsd: 50, monthlyHardUsd: 20 } })).rejects.toThrow(/soft limit/);
    await expect(updateSettings(db, cipher, user.id, { routing: { models: { fast: "gpt-nope" } } })).rejects.toThrow(/Unknown model/);
  });

  it("stores settings encrypted at rest", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    await updateSettings(db, cipher, user.id, { aboutMe: "Private note about Zorza margins" });
    const { rows } = await db.query<{ data: unknown }>("SELECT data FROM settings");
    expect(JSON.stringify(rows[0]!.data)).not.toContain("Zorza");
    expect((await getSettings(db, cipher, user.id)).aboutMe).toBe("Private note about Zorza margins");
  });

  it("validates the daily schedule", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    const sched = (await getSettings(db, cipher, user.id)).schedule;
    expect(sched.briefingTime).toBe("05:30");
    expect(sched.quietHours).toEqual({ start: "22:00", end: "05:00" });
    await expect(updateSettings(db, cipher, user.id, { schedule: { briefingTime: "5.30" } })).rejects.toThrow(/like 05:30/);
    const s = await updateSettings(db, cipher, user.id, { schedule: { quietHours: { start: "23:00" } } });
    expect(s.schedule.quietHours).toEqual({ start: "23:00", end: "05:00" });
  });

  it("ignores unknown keys", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    const s = await updateSettings(db, cipher, user.id, { isAdmin: true, ui: { reduceMotion: true } });
    expect((s as unknown as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(s.ui.reduceMotion).toBe(true);
  });
});
