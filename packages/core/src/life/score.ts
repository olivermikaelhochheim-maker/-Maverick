/**
 * Habit scoring. Pure functions over plain data, so they're easy to test and
 * identical wherever they run.
 *
 * Rules (shown to Oliver on the Life page):
 *  - Daily     = day-habits completed ÷ day-habits scheduled that day.
 *  - Weekly    = completed scheduled occurrences ÷ scheduled occurrences that week.
 *  - "N× per week" targets count completions up to the target, never above it.
 *  - Planned rest and illness (per habit or for the whole day) leave the denominator.
 *  - "Not logged" stays separate from "missed".
 *  - A schedule change applies from a date; earlier weeks keep the old schedule.
 *  - Nothing scheduled → null, shown as "No habits scheduled", never 0%.
 */

export const LIFE_AREAS = ["life", "health", "fitness", "sleep", "mind", "self", "career", "learning", "money", "focus", "people", "purpose"] as const;
export type LifeArea = (typeof LIFE_AREAS)[number];
export const AREA_LABEL: Record<LifeArea, string> = {
  life: "Life & routine",
  health: "Health & energy",
  fitness: "Fitness & movement",
  sleep: "Sleep, food & recovery",
  mind: "Mental wellbeing",
  self: "Confidence & values",
  career: "Career",
  learning: "Learning",
  money: "Finances",
  focus: "Focus & time",
  people: "Relationships",
  purpose: "Purpose & growth",
};

export type HabitKind = "days" | "weekly";
export type HabitStatus = "active" | "paused" | "archived";
export type LogStatus = "done" | "missed" | "rest" | "sick";
export type DayFlag = "rest" | "sick";
export type Occurrence = "done" | "missed" | "excused" | "unlogged";

export interface HabitVersion {
  validFrom: string; // YYYY-MM-DD
  kind: HabitKind;
  /** ISO weekdays, 1 = Monday … 7 = Sunday (kind "days") */
  days: number[];
  /** completions per week (kind "weekly") */
  target: number;
  status: HabitStatus;
}

export interface ScoredHabit {
  id: string;
  area: LifeArea;
  versions: HabitVersion[]; // ascending by validFrom
}

/** logs[habitId][date] = status; flags[date] = flag */
export interface LogBook {
  logs: Record<string, Record<string, LogStatus>>;
  flags: Record<string, DayFlag>;
}

export interface Tally {
  scheduled: number;
  done: number;
  missed: number;
  unlogged: number;
  /** weekly targets: completions still owed (current week) or not reached (final week) */
  short: number;
  excused: number;
  /** completions beyond a weekly target (shown, never scored) */
  extra: number;
  /** null when nothing was scheduled */
  pct: number | null;
}

export interface HabitWeek extends Tally {
  habitId: string;
  area: LifeArea;
  kinds: HabitKind[];
  target: number;
  completions: number;
}

export interface WeekScore {
  monday: string;
  sunday: string;
  status: "current" | "final" | "future";
  total: Tally;
  habits: HabitWeek[];
  byArea: Partial<Record<LifeArea, Tally>>;
}

export interface DayScore extends Tally {
  date: string;
  rows: { habitId: string; status: Occurrence }[];
}

// ---------- date helpers (all on YYYY-MM-DD strings, no time zones involved) ----------

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}
/** ISO weekday, 1 = Monday … 7 = Sunday */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return ((new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7) + 1;
}
export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
export function isoWeekNumber(date: string): number {
  const thursday = addDays(date, 4 - isoWeekday(date));
  const [y] = thursday.split("-").map(Number);
  const jan1 = Date.UTC(y!, 0, 1);
  const [ty, tm, td] = thursday.split("-").map(Number);
  return Math.floor((Date.UTC(ty!, tm! - 1, td!) - jan1) / 86_400_000 / 7) + 1;
}

// ---------- scoring ----------

const pct = (done: number, scheduled: number) => (scheduled ? Math.round((done / scheduled) * 100) : null);
const emptyTally = (): Tally => ({ scheduled: 0, done: 0, missed: 0, unlogged: 0, short: 0, excused: 0, extra: 0, pct: null });
function add(a: Tally, b: Tally) {
  a.scheduled += b.scheduled;
  a.done += b.done;
  a.missed += b.missed;
  a.unlogged += b.unlogged;
  a.short += b.short;
  a.excused += b.excused;
  a.extra += b.extra;
}

export function versionOn(h: ScoredHabit, date: string): HabitVersion | null {
  let v: HabitVersion | null = null;
  for (const x of h.versions) if (x.validFrom <= date) v = x;
  return v;
}

/** Is this a day-habit scheduled on `date`? */
export function scheduledOn(h: ScoredHabit, date: string): boolean {
  const v = versionOn(h, date);
  return !!v && v.status === "active" && v.kind === "days" && v.days.includes(isoWeekday(date));
}

export function occurrence(book: LogBook, habitId: string, date: string): Occurrence {
  const l = book.logs[habitId]?.[date];
  if (l === "done") return "done";
  if (l === "rest" || l === "sick" || book.flags[date]) return "excused";
  if (l === "missed") return "missed";
  return "unlogged";
}

export function scoreDay(habits: ScoredHabit[], book: LogBook, date: string): DayScore {
  const t = emptyTally();
  const rows: DayScore["rows"] = [];
  for (const h of habits) {
    if (!scheduledOn(h, date)) continue;
    const s = occurrence(book, h.id, date);
    rows.push({ habitId: h.id, status: s });
    if (s === "excused") {
      t.excused++;
      continue;
    }
    t.scheduled++;
    t[s]++;
  }
  t.pct = pct(t.done, t.scheduled);
  return { ...t, date, rows };
}

/**
 * Score one Monday–Sunday week. `today` decides whether it's the week so far
 * (day-habits counted through today, weekly targets in full) or the final result.
 */
export function scoreWeek(habits: ScoredHabit[], book: LogBook, monday: string, today: string): WeekScore {
  const days = weekDates(monday);
  const sunday = days[6]!;
  const status: WeekScore["status"] = today > sunday ? "final" : today < monday ? "future" : "current";
  const cutoff = status === "final" ? sunday : today;
  const rows: HabitWeek[] = [];

  if (status !== "future") {
    for (const h of habits) {
      const r: HabitWeek = { ...emptyTally(), habitId: h.id, area: h.area, kinds: [], target: 0, completions: 0 };
      for (const d of days) {
        if (d > cutoff || !scheduledOn(h, d)) continue;
        if (!r.kinds.includes("days")) r.kinds.push("days");
        const s = occurrence(book, h.id, d);
        if (s === "excused") {
          r.excused++;
          continue;
        }
        r.scheduled++;
        r[s]++;
      }
      // A weekly target uses the version in force at the end of the week.
      const v = versionOn(h, sunday);
      if (v && v.status === "active" && v.kind === "weekly") {
        r.kinds.push("weekly");
        let done = 0;
        let excused = 0;
        for (const d of days) {
          const l = book.logs[h.id]?.[d];
          if (l === "done") done++;
          else if (l === "rest" || l === "sick") excused++;
        }
        const target = Math.max(0, v.target - excused);
        const counted = Math.min(done, target);
        r.target = target;
        r.completions = done;
        r.excused += excused;
        r.scheduled += target;
        r.done += counted;
        r.short += target - counted;
        r.extra += Math.max(0, done - target);
      }
      if (r.kinds.length) {
        r.pct = pct(r.done, r.scheduled);
        rows.push(r);
      }
    }
  }

  const total = emptyTally();
  const byArea: WeekScore["byArea"] = {};
  for (const r of rows) {
    add(total, r);
    const a = (byArea[r.area] ??= emptyTally());
    add(a, r);
  }
  total.pct = pct(total.done, total.scheduled);
  for (const a of Object.values(byArea)) a!.pct = pct(a!.done, a!.scheduled);
  return { monday, sunday, status, total, habits: rows, byArea };
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function describeSchedule(v: HabitVersion | null): string {
  if (!v) return "";
  if (v.status === "paused") return "Paused";
  if (v.status === "archived") return "Archived";
  if (v.kind === "weekly") return `${v.target}× per week`;
  const d = [...v.days].sort().join(",");
  if (d === "1,2,3,4,5,6,7") return "Every day";
  if (d === "1,2,3,4,5") return "Weekdays";
  if (d === "6,7") return "Weekends";
  return [...v.days].sort().map((x) => DOW[x - 1]).join(", ");
}

/** "2 of 6 done · 1 missed · 3 not logged" */
export function describeTally(t: Tally, week: WeekScore["status"] | "day" = "day"): string {
  const parts = [`${t.done} of ${t.scheduled} done`];
  if (t.missed) parts.push(`${t.missed} missed`);
  if (t.unlogged) parts.push(`${t.unlogged} not logged`);
  if (t.short) parts.push(`${t.short} ${week === "current" ? "still open on weekly targets" : "short on weekly targets"}`);
  if (t.excused) parts.push(`${t.excused} excused`);
  return parts.join(" · ");
}
