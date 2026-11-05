import { randomUUID } from "node:crypto";
import type { Db } from "./db/types";
import type { FieldCipher } from "./util/crypto";
import { audit } from "./audit";
import { UserFacingError } from "./util/errors";
import { addDays } from "./util/time";

/**
 * Health & performance logs Oliver enters himself. There is no wearable
 * connection; every number shown comes from these entries.
 */

export const HEALTH_KINDS = {
  workout: { label: "Workout", unit: "min", min: 1, max: 600 },
  sleep: { label: "Sleep", unit: "h", min: 0, max: 24 },
  weight: { label: "Weight", unit: "kg", min: 20, max: 400 },
  energy: { label: "Energy", unit: "/5", min: 1, max: 5 },
} as const;
export type HealthKind = keyof typeof HEALTH_KINDS;

export interface HealthEntry {
  id: string;
  date: string;
  kind: HealthKind;
  value: number;
  note: string | null;
}

export interface HealthTrend {
  hasData: boolean;
  days: { date: string; workoutMin: number; sleepH: number | null; weightKg: number | null; energy: number | null }[];
  week: { workouts: number; workoutMin: number; avgSleep: number | null; avgEnergy: number | null };
  prevWeek: { workouts: number; workoutMin: number; avgSleep: number | null; avgEnergy: number | null };
  weight: { latest: number | null; change30: number | null };
  workoutStreakWeeks: number;
  insights: { kind: "warning" | "win" | "tip"; text: string }[];
}

type Row = { id: string; logged_on: Date | string; kind: HealthKind; value: string | number; note_enc: string | null };
const day = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export class HealthStore {
  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
  ) {}

  async add(userId: string, input: { date: unknown; kind: unknown; value: unknown; note?: unknown }): Promise<HealthEntry> {
    const kind = input.kind as HealthKind;
    const spec = HEALTH_KINDS[kind];
    if (!spec) throw new UserFacingError("Kind must be workout, sleep, weight or energy.", "bad_input");
    if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new UserFacingError("Date must look like 2026-11-05.", "bad_input");
    const value = typeof input.value === "string" ? Number(input.value.replace(",", ".")) : Number(input.value);
    if (!Number.isFinite(value) || value < spec.min || value > spec.max) throw new UserFacingError(`${spec.label} must be between ${spec.min} and ${spec.max} ${spec.unit}.`, "bad_input");
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 300) : null;
    const id = randomUUID();
    await this.db.query("INSERT INTO health_entries (id, user_id, logged_on, kind, value, note_enc) VALUES ($1,$2,$3,$4,$5,$6)", [
      id,
      userId,
      input.date,
      kind,
      Math.round(value * 100) / 100,
      note ? this.cipher.encrypt(note) : null,
    ]);
    await audit(this.db, { userId, actor: "user", action: "health.logged", target: id, details: { kind } });
    return { id, date: input.date, kind, value: Math.round(value * 100) / 100, note };
  }

  async list(userId: string, since?: string): Promise<HealthEntry[]> {
    const { rows } = await this.db.query<Row>(
      `SELECT * FROM health_entries WHERE user_id = $1 ${since ? "AND logged_on >= $2" : ""} ORDER BY logged_on DESC, created_at DESC LIMIT 2000`,
      since ? [userId, since] : [userId],
    );
    return rows.map((r) => ({ id: r.id, date: day(r.logged_on), kind: r.kind, value: Number(r.value), note: r.note_enc ? this.cipher.decrypt(r.note_enc) : null }));
  }

  async remove(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query("DELETE FROM health_entries WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    if (!rows.length) throw new UserFacingError("Entry not found.", "not_found", 404);
  }

  async trends(userId: string, today: string): Promise<HealthTrend> {
    const entries = await this.list(userId, addDays(today, -90));
    const days: HealthTrend["days"] = [];
    for (let i = 27; i >= 0; i--) {
      const date = addDays(today, -i);
      const e = entries.filter((x) => x.date === date);
      const pick = (k: HealthKind) => e.filter((x) => x.kind === k).map((x) => x.value);
      const sleep = pick("sleep");
      const weight = pick("weight");
      const energy = pick("energy");
      days.push({
        date,
        workoutMin: pick("workout").reduce((a, b) => a + b, 0),
        sleepH: sleep.length ? sleep.reduce((a, b) => a + b, 0) : null,
        weightKg: weight.length ? weight[0]! : null,
        energy: energy.length ? avg(energy) : null,
      });
    }
    const span = (from: number, to: number) => {
      const ds = days.slice(from, to);
      const workouts = entries.filter((x) => x.kind === "workout" && x.date >= ds[0]!.date && x.date <= ds.at(-1)!.date);
      return {
        workouts: workouts.length,
        workoutMin: workouts.reduce((a, b) => a + b.value, 0),
        avgSleep: avg(ds.flatMap((d) => (d.sleepH === null ? [] : [d.sleepH]))),
        avgEnergy: avg(ds.flatMap((d) => (d.energy === null ? [] : [d.energy]))),
      };
    };
    const week = span(21, 28);
    const prevWeek = span(14, 21);
    const weights = entries.filter((x) => x.kind === "weight");
    const latest = weights[0]?.value ?? null;
    const old = weights.find((w) => w.date <= addDays(today, -30)) ?? weights.at(-1);
    const change30 = latest !== null && old && old.date !== weights[0]!.date ? Math.round((latest - old.value) * 10) / 10 : null;
    // Consecutive 7-day blocks (ending today) with at least 3 workouts.
    let streak = 0;
    for (let w = 0; w < 12; w++) {
      const end = addDays(today, -7 * w);
      const start = addDays(end, -6);
      const n = entries.filter((x) => x.kind === "workout" && x.date >= start && x.date <= end).length;
      if (n >= 3) streak++;
      else break;
    }
    const insights: HealthTrend["insights"] = [];
    if (entries.length) {
      if (week.avgSleep !== null && week.avgSleep < 7) insights.push({ kind: "warning", text: `Average sleep this week is ${week.avgSleep} h. Under 7 h tends to cost focus the next day.` });
      if (week.workouts >= 5) insights.push({ kind: "win", text: `${week.workouts} workouts in the last 7 days. On target for 5 a week.` });
      else if (week.workouts < prevWeek.workouts) insights.push({ kind: "tip", text: `${week.workouts} workouts in the last 7 days, down from ${prevWeek.workouts}. Book the next one in the calendar.` });
      if (week.avgEnergy !== null && prevWeek.avgEnergy !== null && week.avgEnergy - prevWeek.avgEnergy <= -0.7)
        insights.push({ kind: "warning", text: `Energy is down to ${week.avgEnergy}/5 from ${prevWeek.avgEnergy}/5 the week before.` });
      if (!entries.some((x) => x.date >= addDays(today, -3))) insights.push({ kind: "tip", text: "Nothing logged for 3 days. A 10-second log keeps the trends honest." });
    }
    return { hasData: entries.length > 0, days, week, prevWeek, weight: { latest, change30 }, workoutStreakWeeks: streak, insights };
  }
}
