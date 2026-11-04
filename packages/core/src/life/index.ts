import { randomUUID } from "node:crypto";
import type { Db } from "../db/types";
import type { FieldCipher } from "../util/crypto";
import { audit } from "../audit";
import { UserFacingError } from "../util/errors";
import {
  LIFE_AREAS,
  addDays,
  describeTally,
  isoWeekday,
  mondayOf,
  scheduledOn,
  scoreDay,
  scoreWeek,
  versionOn,
  type DayFlag,
  type DayScore,
  type HabitKind,
  type HabitStatus,
  type HabitVersion,
  type LifeArea,
  type LogBook,
  type LogStatus,
  type WeekScore,
} from "./score";

export * from "./score";

export interface Habit {
  id: string;
  title: string;
  minimum: string | null;
  why: string | null;
  area: LifeArea;
  goalId: string | null;
  /** HH:MM local time for a push reminder on days it's due, or null */
  remindTime: string | null;
  sort: number;
  createdAt: string;
  versions: HabitVersion[];
}

export const JOURNAL_PROMPTS = [
  ["feel", "How do I feel today?"],
  ["happened", "What happened?"],
  ["well", "What went well?"],
  ["proud", "What am I proud of?"],
  ["avoid", "What did I handle poorly or avoid?"],
  ["control", "What was within my control?"],
  ["learn", "What did I learn?"],
  ["tomorrow", "What will I do differently tomorrow?"],
  ["support", "What support or recovery do I need?"],
] as const;
export type PromptKey = (typeof JOURNAL_PROMPTS)[number][0];

export interface JournalEntry {
  id: string;
  date: string;
  body: string;
  prompts: Partial<Record<PromptKey, string>>;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  sleepQuality: number | null;
  sleepHours: number | null;
  /** May Maverick read this entry (briefings, chat context)? */
  aiAllowed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LifeOverview {
  today: string;
  habits: Habit[];
  book: LogBook;
  day: DayScore;
  week: WeekScore;
  lastWeek: WeekScore;
  /** daily averages from journal ratings, oldest first */
  trend: { date: string; mood: number | null; energy: number | null; stress: number | null }[];
  recentEntries: JournalEntry[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOG_STATUSES: LogStatus[] = ["done", "missed", "rest", "sick"];
const iso = (d: Date | string) => new Date(d).toISOString();

function text(v: unknown, label: string, max: number, required = false): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) throw new UserFacingError(`${label} is required.`, "bad_input");
    return null;
  }
  if (typeof v !== "string") throw new UserFacingError(`${label} must be text.`, "bad_input");
  const t = v.trim();
  if (required && !t) throw new UserFacingError(`${label} is required.`, "bad_input");
  if (t.length > max) throw new UserFacingError(`${label} is too long (max ${max.toLocaleString()} characters).`, "bad_input");
  return t || null;
}
function date(v: unknown, label: string): string {
  if (typeof v !== "string" || !DATE.test(v) || Number.isNaN(Date.parse(v))) throw new UserFacingError(`${label} must be a date like 2026-11-30.`, "bad_input");
  return v;
}
function rating(v: unknown, label: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new UserFacingError(`${label} must be 1 to 5.`, "bad_input");
  return n;
}
function area(v: unknown): LifeArea {
  if (!LIFE_AREAS.includes(v as LifeArea)) throw new UserFacingError("Pick a life area.", "bad_input");
  return v as LifeArea;
}
function remindTime(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !HHMM.test(v)) throw new UserFacingError("Reminder time must look like 18:30.", "bad_input");
  return v;
}
function schedule(input: { kind?: unknown; days?: unknown; target?: unknown }): Pick<HabitVersion, "kind" | "days" | "target"> {
  const kind = input.kind as HabitKind;
  if (kind === "days") {
    const days = Array.isArray(input.days) ? [...new Set(input.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort() : [];
    if (!days.length) throw new UserFacingError("Pick at least one day.", "bad_input");
    return { kind, days, target: 0 };
  }
  if (kind === "weekly") {
    const target = Number(input.target);
    if (!Number.isInteger(target) || target < 1 || target > 7) throw new UserFacingError("Times per week must be 1 to 7.", "bad_input");
    return { kind, days: [], target };
  }
  throw new UserFacingError("Choose specific days or times per week.", "bad_input");
}

export class LifeStore {
  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
  ) {}

  private enc(v: string | null) {
    return v === null ? null : this.cipher.encrypt(v);
  }
  private dec(v: string | null) {
    return v === null ? null : this.cipher.decrypt(v);
  }

  // ---------- Habits ----------

  async listHabits(userId: string): Promise<Habit[]> {
    const [{ rows: hs }, { rows: vs }] = await Promise.all([
      this.db.query<HabitRow>("SELECT * FROM habits WHERE user_id = $1 ORDER BY sort, created_at", [userId]),
      this.db.query<VersionRow>(
        "SELECT v.* FROM habit_versions v JOIN habits h ON h.id = v.habit_id WHERE h.user_id = $1 ORDER BY v.valid_from",
        [userId],
      ),
    ]);
    const byHabit = new Map<string, HabitVersion[]>();
    for (const v of vs) {
      const list = byHabit.get(v.habit_id) ?? [];
      list.push({ validFrom: v.valid_from, kind: v.kind, days: v.days ? v.days.split(",").map(Number) : [], target: v.target, status: v.status });
      byHabit.set(v.habit_id, list);
    }
    return hs.map((h) => ({
      id: h.id,
      title: this.cipher.decrypt(h.title_enc),
      minimum: this.dec(h.minimum_enc),
      why: this.dec(h.why_enc),
      area: h.area,
      goalId: h.goal_id,
      remindTime: h.remind_time,
      sort: h.sort,
      createdAt: iso(h.created_at),
      versions: byHabit.get(h.id) ?? [],
    }));
  }

  async getHabit(userId: string, id: string): Promise<Habit | null> {
    return (await this.listHabits(userId)).find((h) => h.id === id) ?? null;
  }

  async createHabit(
    userId: string,
    input: { title: unknown; area: unknown; kind: unknown; days?: unknown; target?: unknown; minimum?: unknown; why?: unknown; goalId?: unknown; remindTime?: unknown; from: unknown },
    actor: "user" | "system" = "user",
  ): Promise<Habit> {
    const title = text(input.title, "Habit", 200, true)!;
    const sched = schedule(input);
    const from = date(input.from, "Start date");
    const goalId = await this.checkGoal(userId, input.goalId);
    const id = randomUUID();
    const { rows } = await this.db.query<{ n: number }>("SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM habits WHERE user_id = $1", [userId]);
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO habits (id, user_id, goal_id, title_enc, minimum_enc, why_enc, area, remind_time, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, userId, goalId, this.cipher.encrypt(title), this.enc(text(input.minimum, "Minimum version", 300)), this.enc(text(input.why, "Why", 1000)), area(input.area), remindTime(input.remindTime), Number(rows[0]?.n ?? 0)],
      );
      await tx.query("INSERT INTO habit_versions (habit_id, valid_from, kind, days, target, status) VALUES ($1,$2,$3,$4,$5,'active')", [
        id,
        from,
        sched.kind,
        sched.days.join(","),
        sched.target,
      ]);
    });
    await audit(this.db, { userId, actor, action: "habit.created", target: id });
    return (await this.getHabit(userId, id))!;
  }

  /**
   * Edit a habit. Details (title, minimum, area, goal, reminder) change everywhere.
   * Schedule and status changes add a version from `from`, so earlier weeks keep their scores.
   */
  async updateHabit(
    userId: string,
    id: string,
    patch: {
      title?: unknown;
      area?: unknown;
      minimum?: unknown;
      why?: unknown;
      goalId?: unknown;
      remindTime?: unknown;
      schedule?: { kind?: unknown; days?: unknown; target?: unknown; from?: unknown };
      status?: { value?: unknown; from?: unknown };
    },
  ): Promise<Habit> {
    const h = await this.getHabit(userId, id);
    if (!h) throw new UserFacingError("Habit not found.", "not_found", 404);
    await this.db.query(
      `UPDATE habits SET title_enc=$1, minimum_enc=$2, why_enc=$3, area=$4, goal_id=$5, remind_time=$6, updated_at=now() WHERE id=$7 AND user_id=$8`,
      [
        this.cipher.encrypt(patch.title !== undefined ? text(patch.title, "Habit", 200, true)! : h.title),
        this.enc(patch.minimum !== undefined ? text(patch.minimum, "Minimum version", 300) : h.minimum),
        this.enc(patch.why !== undefined ? text(patch.why, "Why", 1000) : h.why),
        patch.area !== undefined ? area(patch.area) : h.area,
        patch.goalId !== undefined ? await this.checkGoal(userId, patch.goalId) : h.goalId,
        patch.remindTime !== undefined ? remindTime(patch.remindTime) : h.remindTime,
        id,
        userId,
      ],
    );
    const changes: { from: string; v: Omit<HabitVersion, "validFrom"> }[] = [];
    if (patch.schedule) {
      const from = date(patch.schedule.from, "Change applies from");
      const base = versionOn(h, from) ?? h.versions[0]!;
      const s = schedule(patch.schedule);
      if (s.kind !== base.kind || s.target !== base.target || s.days.join() !== base.days.join()) changes.push({ from, v: { ...s, status: base.status } });
    }
    if (patch.status) {
      const from = date(patch.status.from, "Status change date");
      const value = patch.status.value as HabitStatus;
      if (!["active", "paused", "archived"].includes(value)) throw new UserFacingError("Unknown habit status.", "bad_input");
      const pending = changes.find((c) => c.from === from);
      if (pending) pending.v.status = value;
      else {
        const base = versionOn(h, from) ?? h.versions[0]!;
        if (base.status !== value) changes.push({ from, v: { kind: base.kind, days: base.days, target: base.target, status: value } });
      }
    }
    for (const c of changes) {
      // Later versions keep their own schedule; a status change carries forward to them.
      await this.db.query(
        `INSERT INTO habit_versions (habit_id, valid_from, kind, days, target, status) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (habit_id, valid_from) DO UPDATE SET kind = EXCLUDED.kind, days = EXCLUDED.days, target = EXCLUDED.target, status = EXCLUDED.status`,
        [id, c.from, c.v.kind, c.v.days.join(","), c.v.target, c.v.status],
      );
      if (patch.status) await this.db.query("UPDATE habit_versions SET status = $1 WHERE habit_id = $2 AND valid_from > $3", [c.v.status, id, c.from]);
    }
    await audit(this.db, { userId, actor: "user", action: "habit.updated", target: id, details: { fields: Object.keys(patch) } });
    return (await this.getHabit(userId, id))!;
  }

  async deleteHabit(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query("DELETE FROM habits WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    if (!rows.length) throw new UserFacingError("Habit not found.", "not_found", 404);
    await audit(this.db, { userId, actor: "user", action: "habit.deleted", target: id });
  }

  // ---------- Logs ----------

  /** Log one habit on one day. `status: null` clears it back to "not logged". Future days are refused. */
  async setLog(userId: string, habitId: unknown, day: unknown, status: unknown, today: string): Promise<void> {
    const d = date(day, "Date");
    if (d > today) throw new UserFacingError("You can't log a day that hasn't happened yet.", "bad_input");
    if (typeof habitId !== "string" || !(await this.ownsHabit(userId, habitId))) throw new UserFacingError("Habit not found.", "not_found", 404);
    if (status === null || status === "") {
      await this.db.query("DELETE FROM habit_logs WHERE habit_id = $1 AND local_date = $2", [habitId, d]);
    } else {
      if (!LOG_STATUSES.includes(status as LogStatus)) throw new UserFacingError("Unknown log status.", "bad_input");
      await this.db.query(
        `INSERT INTO habit_logs (habit_id, user_id, local_date, status) VALUES ($1,$2,$3,$4)
         ON CONFLICT (habit_id, local_date) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
        [habitId, userId, d, status],
      );
    }
  }

  async setDayFlag(userId: string, day: unknown, flag: unknown, today: string): Promise<void> {
    const d = date(day, "Date");
    if (d > addDays(today, 30)) throw new UserFacingError("Rest days can be planned up to 30 days ahead.", "bad_input");
    if (flag === null || flag === "") await this.db.query("DELETE FROM day_flags WHERE user_id = $1 AND local_date = $2", [userId, d]);
    else {
      if (flag !== "rest" && flag !== "sick") throw new UserFacingError("Unknown day type.", "bad_input");
      await this.db.query(
        "INSERT INTO day_flags (user_id, local_date, flag) VALUES ($1,$2,$3) ON CONFLICT (user_id, local_date) DO UPDATE SET flag = EXCLUDED.flag",
        [userId, d, flag],
      );
    }
  }

  async logBook(userId: string, from: string, to: string): Promise<LogBook> {
    const [{ rows: logs }, { rows: flags }] = await Promise.all([
      this.db.query<{ habit_id: string; local_date: string; status: LogStatus }>(
        "SELECT habit_id, local_date, status FROM habit_logs WHERE user_id = $1 AND local_date BETWEEN $2 AND $3",
        [userId, from, to],
      ),
      this.db.query<{ local_date: string; flag: DayFlag }>("SELECT local_date, flag FROM day_flags WHERE user_id = $1 AND local_date BETWEEN $2 AND $3", [
        userId,
        from,
        to,
      ]),
    ]);
    const book: LogBook = { logs: {}, flags: {} };
    for (const l of logs) (book.logs[l.habit_id] ??= {})[l.local_date] = l.status;
    for (const f of flags) book.flags[f.local_date] = f.flag;
    return book;
  }

  // ---------- Scores ----------

  async overview(userId: string, today: string): Promise<LifeOverview> {
    const monday = mondayOf(today);
    const [habits, book, trend, recentEntries] = await Promise.all([
      this.listHabits(userId),
      this.logBook(userId, addDays(monday, -7), addDays(monday, 6)),
      this.trend(userId, today, 14),
      this.listEntries(userId, { limit: 3 }),
    ]);
    return {
      today,
      habits,
      book,
      day: scoreDay(habits, book, today),
      week: scoreWeek(habits, book, monday, today),
      lastWeek: scoreWeek(habits, book, addDays(monday, -7), today),
      trend,
      recentEntries,
    };
  }

  async week(userId: string, monday: unknown, today: string): Promise<{ habits: Habit[]; book: LogBook; score: WeekScore }> {
    const m = mondayOf(date(monday, "Week"));
    const [habits, book] = await Promise.all([this.listHabits(userId), this.logBook(userId, m, addDays(m, 6))]);
    return { habits, book, score: scoreWeek(habits, book, m, today) };
  }

  /** The last `weeks` weeks (newest first) plus completion by weekday over the same span. */
  async history(userId: string, today: string, weeks = 8): Promise<{ weeks: WeekScore[]; byWeekday: { scheduled: number; done: number }[] }> {
    const monday = mondayOf(today);
    const start = addDays(monday, -7 * (weeks - 1));
    const [habits, book] = await Promise.all([this.listHabits(userId), this.logBook(userId, start, addDays(monday, 6))]);
    const out = Array.from({ length: weeks }, (_, i) => scoreWeek(habits, book, addDays(monday, -7 * i), today));
    const byWeekday = Array.from({ length: 7 }, () => ({ scheduled: 0, done: 0 }));
    for (let d = start; d < today; d = addDays(d, 1)) {
      const s = scoreDay(habits, book, d);
      byWeekday[isoWeekday(d) - 1]!.scheduled += s.scheduled;
      byWeekday[isoWeekday(d) - 1]!.done += s.done;
    }
    return { weeks: out, byWeekday };
  }

  // ---------- Journal ----------

  async listEntries(userId: string, opts: { q?: string; limit?: number; from?: string; to?: string; aiOnly?: boolean } = {}): Promise<JournalEntry[]> {
    const { rows } = await this.db.query<EntryRow>(
      `SELECT * FROM journal_entries WHERE user_id = $1 AND local_date BETWEEN $2 AND $3 ${opts.aiOnly ? "AND ai_allowed" : ""}
       ORDER BY local_date DESC, updated_at DESC LIMIT $4`,
      [userId, opts.from ?? "0000-01-01", opts.to ?? "9999-12-31", opts.q ? 100_000 : (opts.limit ?? 500)],
    );
    let entries = rows.map((r) => this.toEntry(r));
    // Content is encrypted at rest, so search happens after decryption.
    const q = opts.q?.trim().toLowerCase();
    if (q) entries = entries.filter((e) => [e.date, e.body, ...Object.values(e.prompts)].join("\n").toLowerCase().includes(q)).slice(0, opts.limit ?? 500);
    return entries;
  }

  async getEntry(userId: string, id: string): Promise<JournalEntry | null> {
    const { rows } = await this.db.query<EntryRow>("SELECT * FROM journal_entries WHERE id = $1 AND user_id = $2", [id, userId]);
    return rows[0] ? this.toEntry(rows[0]) : null;
  }

  async createEntry(userId: string, input: EntryInput, today: string): Promise<JournalEntry> {
    const data = this.entryData(input, null);
    const d = date(input.date ?? today, "Date");
    if (d > today) throw new UserFacingError("Journal entries can't be dated in the future.", "bad_input");
    const id = randomUUID();
    await this.db.query("INSERT INTO journal_entries (id, user_id, local_date, data_enc, ai_allowed) VALUES ($1,$2,$3,$4,$5)", [
      id,
      userId,
      d,
      this.cipher.encrypt(JSON.stringify(data)),
      input.aiAllowed !== false,
    ]);
    await audit(this.db, { userId, actor: "user", action: "journal.created", target: id });
    return (await this.getEntry(userId, id))!;
  }

  /** Autosave-friendly: only fields present in the patch change. Not audited per keystroke. */
  async updateEntry(userId: string, id: string, patch: EntryInput, today: string): Promise<JournalEntry> {
    const e = await this.getEntry(userId, id);
    if (!e) throw new UserFacingError("Entry not found.", "not_found", 404);
    const d = patch.date !== undefined ? date(patch.date, "Date") : e.date;
    if (d > today) throw new UserFacingError("Journal entries can't be dated in the future.", "bad_input");
    const data = this.entryData(patch, e);
    await this.db.query("UPDATE journal_entries SET local_date=$1, data_enc=$2, ai_allowed=$3, updated_at=now() WHERE id=$4 AND user_id=$5", [
      d,
      this.cipher.encrypt(JSON.stringify(data)),
      patch.aiAllowed !== undefined ? patch.aiAllowed !== false : e.aiAllowed,
      id,
      userId,
    ]);
    return (await this.getEntry(userId, id))!;
  }

  async deleteEntry(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query("DELETE FROM journal_entries WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    if (!rows.length) throw new UserFacingError("Entry not found.", "not_found", 404);
    await audit(this.db, { userId, actor: "user", action: "journal.deleted", target: id });
  }

  /** Daily averages of journal ratings, oldest first, one point per day (null when nothing was rated). */
  async trend(userId: string, today: string, days: number) {
    const from = addDays(today, -(days - 1));
    const entries = await this.listEntries(userId, { from, to: today, limit: 1000 });
    const out: LifeOverview["trend"] = [];
    for (let d = from; d <= today; d = addDays(d, 1)) {
      const es = entries.filter((e) => e.date === d);
      const avg = (k: "mood" | "energy" | "stress") => {
        const v = es.map((e) => e[k]).filter((x): x is number => x !== null);
        return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
      };
      out.push({ date: d, mood: avg("mood"), energy: avg("energy"), stress: avg("stress") });
    }
    return out;
  }

  private entryData(input: EntryInput, prev: JournalEntry | null) {
    const prompts: Partial<Record<PromptKey, string>> = { ...(prev?.prompts ?? {}) };
    if (input.prompts !== undefined) {
      if (typeof input.prompts !== "object" || input.prompts === null) throw new UserFacingError("Prompts must be an object.", "bad_input");
      for (const [k] of JOURNAL_PROMPTS) {
        const v = (input.prompts as Record<string, unknown>)[k];
        if (v === undefined) continue;
        const t = text(v, "Prompt answer", 4000);
        if (t) prompts[k] = t;
        else delete prompts[k];
      }
    }
    let sleepHours = prev?.sleepHours ?? null;
    if (input.sleepHours !== undefined) {
      if (input.sleepHours === null || input.sleepHours === "") sleepHours = null;
      else {
        const n = Number(input.sleepHours);
        if (!Number.isFinite(n) || n < 0 || n > 24) throw new UserFacingError("Hours slept must be 0 to 24.", "bad_input");
        sleepHours = Math.round(n * 2) / 2;
      }
    }
    const pick = (k: "mood" | "energy" | "stress" | "sleepQuality", label: string) => (input[k] !== undefined ? rating(input[k], label) : (prev?.[k] ?? null));
    return {
      body: input.body !== undefined ? (text(input.body, "Entry", 20_000) ?? "") : (prev?.body ?? ""),
      prompts,
      mood: pick("mood", "Mood"),
      energy: pick("energy", "Energy"),
      stress: pick("stress", "Stress"),
      sleepQuality: pick("sleepQuality", "Sleep quality"),
      sleepHours,
    };
  }

  private toEntry(r: EntryRow): JournalEntry {
    const d = JSON.parse(this.cipher.decrypt(r.data_enc)) as Omit<JournalEntry, "id" | "date" | "aiAllowed" | "createdAt" | "updatedAt">;
    return {
      id: r.id,
      date: r.local_date,
      body: d.body ?? "",
      prompts: d.prompts ?? {},
      mood: d.mood ?? null,
      energy: d.energy ?? null,
      stress: d.stress ?? null,
      sleepQuality: d.sleepQuality ?? null,
      sleepHours: d.sleepHours ?? null,
      aiAllowed: r.ai_allowed,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    };
  }

  // ---------- For briefings, chat context and reminders ----------

  /** Compact text for the model: today's habits, the week so far, recent ratings. Empty when Oliver has no habits. */
  async renderForModel(userId: string, today: string, opts: { journalDays?: number } = {}): Promise<string> {
    const o = await this.overview(userId, today);
    const live = o.habits.filter((h) => versionOn(h, today)?.status === "active");
    if (!live.length) return "";
    const title = new Map(o.habits.map((h) => [h.id, h.title]));
    const label = { done: "done", missed: "missed", excused: "excused (rest/illness)", unlogged: "not logged yet" };
    const lines: string[] = ["Habits (Life dashboard). Completion measures habits, not the person."];
    if (o.day.rows.length) {
      lines.push(`Today (${today}): ${o.day.pct === null ? "nothing countable" : `${o.day.pct}%`} · ${describeTally(o.day)}`);
      for (const r of o.day.rows) lines.push(`- ${title.get(r.habitId)}: ${label[r.status]}`);
    } else lines.push(`Today (${today}): no day-habits scheduled.`);
    const weekly = o.week.habits.filter((h) => h.kinds.includes("weekly"));
    for (const w of weekly) lines.push(`- ${title.get(w.habitId)} (weekly target): ${Math.min(w.completions, w.target)} of ${w.target} this week`);
    if (o.book.flags[today]) lines.push(`Today is marked as ${o.book.flags[today] === "sick" ? "an illness day" : "a planned rest day"}.`);
    lines.push(`This week so far: ${o.week.total.pct === null ? "nothing scheduled" : `${o.week.total.pct}% (${describeTally(o.week.total, "current")})`}.`);
    lines.push(`Last week, final: ${o.lastWeek.total.pct === null ? "nothing scheduled" : `${o.lastWeek.total.pct}% (${describeTally(o.lastWeek.total, "final")})`}.`);
    // Ratings only from entries Oliver allowed Maverick to read.
    const rated = (await this.listEntries(userId, { from: addDays(today, -6), to: today, aiOnly: true, limit: 50 }))
      .filter((e) => e.mood !== null || e.energy !== null)
      .reverse()
      .slice(-5);
    if (rated.length) lines.push(`Recent journal ratings (1–5): ${rated.map((e) => `${e.date.slice(5)} mood ${e.mood ?? "–"}, energy ${e.energy ?? "–"}`).join("; ")}.`);
    if (opts.journalDays) {
      const entries = (await this.listEntries(userId, { from: addDays(today, -(opts.journalDays - 1)), to: today, aiOnly: true, limit: 10 })).reverse();
      if (entries.length) {
        lines.push(`Journal entries Oliver allowed Maverick to read (last ${opts.journalDays} days):`);
        for (const e of entries) {
          const prompts = JOURNAL_PROMPTS.filter(([k]) => e.prompts[k]).map(([k, q]) => `${q} ${e.prompts[k]!.slice(0, 300)}`);
          lines.push(`### ${e.date}\n${[e.body.slice(0, 900), ...prompts].filter(Boolean).join("\n")}`);
        }
      }
    }
    return lines.join("\n");
  }

  /** Short lines for no-model briefing templates. */
  async templateLines(userId: string, today: string, kind: "morning" | "evening" | "weekly"): Promise<string[]> {
    const o = await this.overview(userId, today);
    if (!o.habits.some((h) => versionOn(h, today)?.status === "active")) return [];
    const title = new Map(o.habits.map((h) => [h.id, h.title]));
    if (kind === "weekly") {
      const w = o.week.status === "current" && isoWeekday(today) === 7 ? o.week : o.lastWeek;
      return [`**Habits this week**: ${w.total.pct === null ? "nothing scheduled" : `${w.total.pct}% · ${describeTally(w.total, w.status)}`}. [Open Life](/life/habits)`];
    }
    const rows = o.day.rows.filter((r) => kind === "morning" || r.status === "unlogged");
    const weekly = o.week.habits.filter((h) => h.kinds.includes("weekly") && h.short > 0);
    if (!rows.length && !weekly.length) return kind === "evening" ? ["**Habits**: everything for today is logged."] : [];
    const out = [kind === "morning" ? "**Habits today**" : "**Habits not logged yet**"];
    for (const r of rows) out.push(`- ${title.get(r.habitId)}`);
    for (const w of weekly) out.push(`- ${title.get(w.habitId)}: ${w.short} to go this week`);
    out.push("[Log them in Life](/life)");
    return out;
  }

  /**
   * Habits with a reminder time that is now due today and haven't been logged or reminded today.
   * Weekly-target habits remind only while the week's target is still open.
   */
  async dueHabitReminders(userId: string, today: string, hhmm: string): Promise<Habit[]> {
    const { rows } = await this.db.query<{ id: string }>(
      "SELECT id FROM habits WHERE user_id = $1 AND remind_time IS NOT NULL AND remind_time <= $2 AND (last_reminded_date IS NULL OR last_reminded_date <> $3)",
      [userId, hhmm, today],
    );
    if (!rows.length) return [];
    const ids = new Set(rows.map((r) => r.id));
    const monday = mondayOf(today);
    const [habits, book] = await Promise.all([this.listHabits(userId), this.logBook(userId, monday, addDays(monday, 6))]);
    const week = scoreWeek(habits, book, monday, today);
    return habits.filter((h) => {
      if (!ids.has(h.id) || book.flags[today] || book.logs[h.id]?.[today]) return false;
      if (scheduledOn(h, today)) return true;
      const w = week.habits.find((x) => x.habitId === h.id);
      return !!w && w.kinds.includes("weekly") && w.short > 0;
    });
  }

  async markHabitReminded(habitId: string, today: string): Promise<void> {
    await this.db.query("UPDATE habits SET last_reminded_date = $1 WHERE id = $2", [today, habitId]);
  }

  // ---------- Export / import ----------

  async exportAll(userId: string) {
    const habits = await this.listHabits(userId);
    const book = await this.logBook(userId, "0000-01-01", "9999-12-31");
    return { habits, logs: book.logs, dayFlags: book.flags, journal: await this.listEntries(userId, { limit: 100_000 }) };
  }

  /**
   * Import habits, logs, day flags and journal entries from a Maverick export ("life" section)
   * or a Daybook export. Only into an account with no habits and no journal yet.
   */
  async importAll(userId: string, raw: unknown, opts: { goalIds?: Map<string, string> } = {}): Promise<{ habits: number; logs: number; dayFlags: number; journal: number; profile: number }> {
    const src = normalizeImport(raw);
    const { rows } = await this.db.query<{ n: number }>(
      "SELECT (SELECT count(*) FROM habits WHERE user_id = $1) + (SELECT count(*) FROM journal_entries WHERE user_id = $1) AS n",
      [userId],
    );
    if (Number(rows[0]?.n ?? 0) > 0) throw new UserFacingError("Import only works while Life has no habits or journal entries yet.", "not_empty", 409);
    const result = { habits: 0, logs: 0, dayFlags: 0, journal: 0, profile: 0 };
    await this.db.transaction(async (tx) => {
      const ids = new Map<string, string>();
      for (const [i, h] of src.habits.entries()) {
        const versions = h.versions.filter((v) => DATE.test(v.validFrom) && (v.kind === "days" ? v.days.length : v.target >= 1));
        if (!h.title || !versions.length) continue;
        const id = randomUUID();
        ids.set(h.id, id);
        const goalId = h.goalId && opts.goalIds?.get(h.goalId) ? opts.goalIds.get(h.goalId)! : null;
        await tx.query(
          `INSERT INTO habits (id, user_id, goal_id, title_enc, minimum_enc, why_enc, area, remind_time, sort, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [id, userId, goalId, this.cipher.encrypt(h.title.slice(0, 200)), this.enc(h.minimum?.slice(0, 300) || null), this.enc(h.why?.slice(0, 1000) || null), h.area, h.remindTime, i, h.createdAt],
        );
        for (const v of versions) {
          await tx.query(
            "INSERT INTO habit_versions (habit_id, valid_from, kind, days, target, status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
            [id, v.validFrom, v.kind, v.days.join(","), v.kind === "weekly" ? Math.min(7, v.target) : 0, v.status],
          );
        }
        result.habits++;
      }
      for (const [oldId, days] of Object.entries(src.logs)) {
        const id = ids.get(oldId);
        if (!id) continue;
        for (const [d, s] of Object.entries(days)) {
          if (!DATE.test(d) || !LOG_STATUSES.includes(s)) continue;
          await tx.query("INSERT INTO habit_logs (habit_id, user_id, local_date, status) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [id, userId, d, s]);
          result.logs++;
        }
      }
      for (const [d, f] of Object.entries(src.flags)) {
        if (!DATE.test(d) || (f !== "rest" && f !== "sick")) continue;
        await tx.query("INSERT INTO day_flags (user_id, local_date, flag) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [userId, d, f]);
        result.dayFlags++;
      }
      for (const e of src.journal) {
        if (!DATE.test(e.date)) continue;
        const clamp = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null);
        const data = {
          body: (e.body ?? "").slice(0, 20_000),
          prompts: Object.fromEntries(JOURNAL_PROMPTS.map(([k]) => [k, e.prompts?.[k]]).filter(([, v]) => typeof v === "string" && v)),
          mood: clamp(e.mood),
          energy: clamp(e.energy),
          stress: clamp(e.stress),
          sleepQuality: clamp(e.sleepQuality),
          sleepHours: typeof e.sleepHours === "number" && e.sleepHours >= 0 && e.sleepHours <= 24 ? e.sleepHours : null,
        };
        await tx.query("INSERT INTO journal_entries (id, user_id, local_date, data_enc, ai_allowed, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)", [
          randomUUID(),
          userId,
          e.date,
          this.cipher.encrypt(JSON.stringify(data)),
          e.aiAllowed !== false,
          e.createdAt,
        ]);
        result.journal++;
      }
      // Daybook profile lines Oliver stated or confirmed become memories (source: import).
      for (const p of src.profile) {
        await tx.query(
          `INSERT INTO memories (id, user_id, category, content_enc, source, confidence, retention) VALUES ($1,$2,$3,$4,'import',$5,'permanent')`,
          [randomUUID(), userId, p.category, this.cipher.encrypt(p.text.slice(0, 2000)), p.confidence],
        );
        result.profile++;
      }
    });
    await audit(this.db, { userId, actor: "user", action: "life.imported", details: { ...result, source: src.source } });
    return result;
  }

  private async ownsHabit(userId: string, id: string) {
    const { rows } = await this.db.query("SELECT 1 FROM habits WHERE id = $1 AND user_id = $2", [id, userId]);
    return rows.length > 0;
  }

  private async checkGoal(userId: string, goalId: unknown): Promise<string | null> {
    if (goalId === undefined || goalId === null || goalId === "") return null;
    if (typeof goalId !== "string") throw new UserFacingError("Linked goal not found.", "bad_input");
    const { rows } = await this.db.query("SELECT 1 FROM goals WHERE id = $1 AND user_id = $2", [goalId, userId]);
    if (!rows.length) throw new UserFacingError("Linked goal not found.", "bad_input");
    return goalId;
  }
}

export type EntryInput = {
  date?: unknown;
  body?: unknown;
  prompts?: unknown;
  mood?: unknown;
  energy?: unknown;
  stress?: unknown;
  sleepQuality?: unknown;
  sleepHours?: unknown;
  aiAllowed?: unknown;
};

// ---------- Import normalisation (Maverick "life" section or a Daybook export) ----------

interface NormalHabit {
  id: string;
  title: string;
  minimum: string | null;
  why: string | null;
  area: LifeArea;
  goalId: string | null;
  remindTime: string | null;
  createdAt: string;
  versions: HabitVersion[];
}
interface NormalImport {
  source: "maverick" | "daybook";
  habits: NormalHabit[];
  logs: Record<string, Record<string, LogStatus>>;
  flags: Record<string, DayFlag>;
  journal: { date: string; body?: string; prompts?: Record<string, string>; mood?: unknown; energy?: unknown; stress?: unknown; sleepQuality?: unknown; sleepHours?: unknown; aiAllowed?: boolean; createdAt: string }[];
  profile: { category: "profile" | "preference" | "goal"; text: string; confidence: number }[];
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []) as Record<string, unknown>[];
const str = (v: unknown) => (typeof v === "string" ? v : null);
const when = (v: unknown) => (typeof v === "string" || typeof v === "number") && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : new Date().toISOString();

function normVersion(v: Record<string, unknown>, fromKey: "validFrom" | "from"): HabitVersion | null {
  const validFrom = str(v[fromKey]);
  const kind = v.kind === "weekly" ? "weekly" : v.kind === "days" ? "days" : null;
  if (!validFrom || !kind) return null;
  const days = (Array.isArray(v.days) ? v.days.map(Number) : []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const status = ["active", "paused", "archived"].includes(String(v.status)) ? (v.status as HabitStatus) : "active";
  return { validFrom, kind, days: [...new Set(days)].sort(), target: Number(v.target) || 0, status };
}

export function normalizeImport(raw: unknown): NormalImport {
  const d = obj(raw);
  const areaOf = (v: unknown): LifeArea => (LIFE_AREAS.includes(v as LifeArea) ? (v as LifeArea) : "life");
  // Maverick export (whole file or its "life" section)
  const life = d.format === "maverick-export-v1" ? obj(d.life) : d.habits && d.journal && d.dayFlags ? d : null;
  if (life) {
    return {
      source: "maverick",
      habits: arr(life.habits).map((h) => ({
        id: String(h.id),
        title: str(h.title) ?? "",
        minimum: str(h.minimum),
        why: str(h.why),
        area: areaOf(h.area),
        goalId: str(h.goalId),
        remindTime: typeof h.remindTime === "string" && HHMM.test(h.remindTime) ? h.remindTime : null,
        createdAt: when(h.createdAt),
        versions: arr(h.versions).map((v) => normVersion(v, "validFrom")).filter((v): v is HabitVersion => !!v).sort((a, b) => a.validFrom.localeCompare(b.validFrom)),
      })),
      logs: obj(life.logs) as NormalImport["logs"],
      flags: obj(life.dayFlags) as NormalImport["flags"],
      journal: arr(life.journal).map((e) => ({ ...(e as object), date: String(e.date), createdAt: when(e.createdAt), aiAllowed: e.aiAllowed !== false, prompts: obj(e.prompts) as Record<string, string>, body: str(e.body) ?? "" })),
      profile: [],
    };
  }
  // Daybook export (Settings → Export everything)
  if (d.exportedAt && (Array.isArray(d.habits) || Array.isArray(d.journal) || d.logs)) {
    const logs: NormalImport["logs"] = {};
    const flags: NormalImport["flags"] = {};
    for (const week of Object.values(obj(d.logs))) {
      const w = obj(week);
      for (const [hid, days] of Object.entries(obj(w.h))) Object.assign((logs[hid] ??= {}), obj(days));
      Object.assign(flags, obj(w.day));
    }
    const FIELD: Record<string, "profile" | "preference" | "goal"> = {
      priorities: "goal",
      goals: "goal",
      constraints: "profile",
      routines: "profile",
      strengths: "profile",
      obstacles: "profile",
      coaching: "preference",
    };
    const profile = arr(obj(d.profile).items)
      .filter((x) => typeof x.text === "string" && x.text.trim() && FIELD[String(x.field)] && x.status !== "rejected" && (x.kind !== "interpretation" || x.status === "confirmed"))
      .map((x) => ({ category: FIELD[String(x.field)]!, text: String(x.text).trim(), confidence: x.kind === "interpretation" ? 0.7 : 1 }));
    return {
      source: "daybook",
      habits: arr(d.habits).map((h) => ({
        id: String(h.id),
        title: str(h.title) ?? "",
        minimum: str(h.minimum),
        why: str(h.why) ?? (str(h.goal) ? `Goal: ${h.goal}` : null),
        area: areaOf(h.area),
        goalId: null,
        remindTime: null,
        createdAt: when(h.createdAt),
        versions: arr(h.versions).map((v) => normVersion(v, "from")).filter((v): v is HabitVersion => !!v).sort((a, b) => a.validFrom.localeCompare(b.validFrom)),
      })),
      logs,
      flags,
      journal: arr(d.journal).map((e) => ({
        date: String(e.date),
        body: str(e.body) ?? "",
        prompts: obj(e.prompts) as Record<string, string>,
        mood: e.mood,
        energy: e.energy,
        stress: e.stress,
        sleepQuality: e.sleepQ,
        sleepHours: e.sleepH,
        aiAllowed: e.ai !== false,
        createdAt: when(e.createdAt),
      })),
      profile,
    };
  }
  throw new UserFacingError("That file isn't a Daybook or Maverick export.", "bad_import");
}

type HabitRow = {
  id: string;
  user_id: string;
  goal_id: string | null;
  title_enc: string;
  minimum_enc: string | null;
  why_enc: string | null;
  area: LifeArea;
  remind_time: string | null;
  last_reminded_date: string | null;
  sort: number;
  created_at: Date | string;
};
type VersionRow = { habit_id: string; valid_from: string; kind: HabitKind; days: string; target: number; status: HabitStatus };
type EntryRow = { id: string; user_id: string; local_date: string; data_enc: string; ai_allowed: boolean; created_at: Date | string; updated_at: Date | string };
