import { createHash } from "node:crypto";
import type { Db } from "../db/types";
import type { User } from "../auth";
import type { Settings } from "../settings";
import type { ChatDeps } from "../chat/service";
import type { FinanceStore } from "../finance";
import type { HealthStore } from "../health";
import { audit } from "../audit";
import { UserFacingError } from "../util/errors";
import { addDays, localParts, zonedToUtc } from "../util/time";
import { LIBRARY } from "./tasks";
import { DOMAIN_LABELS, type LibraryDomain, type LibraryTask, type LibraryTrigger } from "./types";

export * from "./types";
export { recordLibraryDecision, type LibraryDecision } from "./state";
export { LIBRARY } from "./tasks";

/**
 * The task library engine. Every morning it looks at all 232 researched tasks,
 * keeps the ones whose trigger fires today (a date, a pattern in Oliver's data,
 * a step he has unlocked), scores them, and proposes a few into the suggestion
 * inbox: at most `perDay`, at most one per domain, nothing big on a shift day.
 * It learns from accept / "not now" / "never".
 */


interface StateRow {
  task_id: string;
  shown_count: number;
  accepted_count: number;
  dismissed_count: number;
  never: boolean;
  snoozed_until: string | null;
  last_period: string | null;
  last_shown_at: Date | string | null;
  last_accepted_at: Date | string | null;
}

export interface Candidate {
  task: LibraryTask;
  period: string;
  /** YYYY-MM-DD the task should be done by, when it has one. */
  deadline: string | null;
  /** Why it is suggested now, in plain words. */
  reason: string;
  score: number;
}

export interface LibraryItemView extends LibraryTask {
  status: "accepted" | "pending" | "never" | "snoozed" | "eligible" | "waiting" | "locked" | "done_for_now";
  statusText: string;
  acceptedCount: number;
}

const ONE_OFF = new Set(["now", "habit", "after", "window", "anchor"]);
const RESHOW_DAYS = 21; // an ignored one-off comes back after this

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
const toDay = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const lastOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export class TaskLibrary {
  constructor(
    private readonly db: Db,
    private readonly deps: ChatDeps,
    private readonly finance: FinanceStore,
    private readonly health: HealthStore,
  ) {}

  get tasks(): LibraryTask[] {
    return LIBRARY;
  }

  private async state(userId: string): Promise<Map<string, StateRow>> {
    const { rows } = await this.db.query<StateRow>("SELECT * FROM library_state WHERE user_id = $1", [userId]);
    return new Map(rows.map((r) => [r.task_id, r]));
  }

  private async pendingIds(userId: string): Promise<Set<string>> {
    const { rows } = await this.db.query<{ source_ref: string }>("SELECT source_ref FROM suggestions WHERE user_id = $1 AND source = 'library' AND status = 'pending'", [userId]);
    return new Set(rows.map((r) => r.source_ref));
  }

  /** Is the trigger live today? Returns the period key (once per period) and an optional deadline. */
  private window(t: LibraryTrigger, today: string, settings: Settings, st: Map<string, StateRow>): { period: string; deadline: string | null; reason: string } | null {
    const [y, m, d] = today.split("-").map(Number) as [number, number, number];
    switch (t.type) {
      case "now":
        return { period: "once", deadline: null, reason: "A first step you haven't taken yet" };
      case "habit":
        return { period: "once", deadline: null, reason: "A habit worth adopting" };
      case "after": {
        const prev = st.get(t.id);
        const at = toDay(prev?.last_accepted_at ?? null);
        if (!prev?.accepted_count || !at) return null;
        return dayDiff(today, at) >= t.days ? { period: "once", deadline: null, reason: `Follows ${t.id}, which you accepted on ${at}` } : null;
      }
      case "window":
        return today >= t.from && today <= t.to ? { period: "once", deadline: t.to, reason: `Due by ${t.to}` } : null;
      case "anchor": {
        const a = settings.library.anchors[t.anchor];
        if (!a) return null;
        const from = addDays(a, t.from);
        const to = addDays(a, t.to);
        if (today < from || today > to) return null;
        const name = { exam: "your exam", exam2: "your next exam", pilotStart: "pilot school starts" }[t.anchor];
        const left = dayDiff(a, today);
        return { period: "once", deadline: to, reason: left > 0 ? `${left} days until ${name} (${a})` : `After ${name} (${a})` };
      }
      case "yearly": {
        const date = `${y}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
        const end = addDays(date, 6);
        return today >= date && today <= end ? { period: String(y), deadline: end, reason: "Yearly, this week" } : null;
      }
      case "monthly": {
        const last = lastOfMonth(y, m);
        let target: number;
        if (typeof t.day === "number") target = Math.min(t.day, last);
        else if (t.day === "last") target = last;
        else if (t.day === "first-sun") target = [...Array(7).keys()].map((i) => i + 1).find((x) => weekdayOf(`${y}-${String(m).padStart(2, "0")}-${String(x).padStart(2, "0")}`) === 0)!;
        else target = [...Array(7).keys()].map((i) => last - i).find((x) => weekdayOf(`${y}-${String(m).padStart(2, "0")}-${String(x).padStart(2, "0")}`) === 0)!;
        const start = `${y}-${String(m).padStart(2, "0")}-${String(target).padStart(2, "0")}`;
        // Live for 4 days from the target, but not past the end of the month's "last" days into the next month.
        return today >= start && dayDiff(today, start) <= 3 ? { period: `${y}-${m}`, deadline: addDays(start, 3), reason: "Monthly" } : null;
      }
      case "weekly": {
        const wd = weekdayOf(today);
        const off = (wd - t.weekday + 7) % 7;
        if (off > 1) return null;
        const start = addDays(today, -off);
        return { period: `w${start}`, deadline: addDays(start, 1), reason: "Weekly" };
      }
      case "quarterly": {
        const qStartMonth = [1, 4, 7, 10].includes(m);
        const qEndMonth = [3, 6, 9, 12].includes(m);
        const q = Math.ceil(m / 3);
        if (t.at === "start" && qStartMonth && d <= 10) return { period: `${y}-q${q}`, deadline: `${y}-${String(m).padStart(2, "0")}-10`, reason: "Start of the quarter" };
        if (t.at === "end" && qEndMonth && d > lastOfMonth(y, m) - 10) return { period: `${y}-q${q}`, deadline: `${y}-${String(m).padStart(2, "0")}-${lastOfMonth(y, m)}`, reason: "End of the quarter" };
        return null;
      }
      case "every": {
        const n = Math.floor(Date.parse(`${today}T12:00:00Z`) / 86400000 / t.days);
        return { period: `e${n}`, deadline: null, reason: `Every ${t.days} days` };
      }
      case "condition":
        return null; // handled asynchronously in candidates()
    }
  }

  private async conditions(user: User, settings: Settings, today: string, now: Date): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = { subscriptions: null, low_energy: null, overdue_2d: null, no_activity_2d: null };
    try {
      const fin = await this.finance.intelligence(user.id, today);
      const subs = fin.recurring.filter((r) => r.category === "subscriptions");
      if (subs.length >= 3) out.subscriptions = `Your bank data shows ${subs.length} recurring subscriptions`;
    } catch {
      /* no finance data */
    }
    const energy = (await this.health.list(user.id, addDays(today, -21))).filter((e) => e.kind === "energy");
    if (energy.length >= 5) {
      const avg = energy.reduce((a, b) => a + b.value, 0) / energy.length;
      if (avg <= 2) out.low_energy = `Your logged energy has averaged ${avg.toFixed(1)}/5 for 3 weeks`;
    }
    const open = await this.deps.planning.listTasks(user.id);
    const old = open.filter((t) => t.dueDate && dayDiff(today, t.dueDate) >= 2);
    if (old.length) out.overdue_2d = `"${old[0]!.title}" has been overdue since ${old[0]!.dueDate}`;
    const since2 = zonedToUtc(addDays(today, -1), "00:00", settings.timezone);
    const since14 = zonedToUtc(addDays(today, -14), "00:00", settings.timezone);
    const [done2, focus2, done14] = await Promise.all([
      this.deps.planning.completedSince(user.id, since2),
      this.deps.focus.sessionsSince(user.id, since2, now),
      this.deps.planning.completedSince(user.id, since14),
    ]);
    if (!done2.length && !focus2.length && done14.length >= 3) out.no_activity_2d = "Nothing logged for 2 days after a good run";
    return out;
  }

  /** Today's live candidates, best first (before the per-day and per-domain limits). */
  async candidates(user: User, settings: Settings, now = new Date()): Promise<Candidate[]> {
    const today = localParts(settings.timezone, now).date;
    const st = await this.state(user.id);
    const pending = await this.pendingIds(user.id);
    const conds = LIBRARY.some((t) => t.trigger.type === "condition") ? await this.conditions(user, settings, today, now) : {};

    // How Oliver has answered per domain: accepted / shown, smoothed.
    const dom = new Map<LibraryDomain, { a: number; s: number }>();
    for (const t of LIBRARY) {
      const r = st.get(t.id);
      const e = dom.get(t.domain) ?? { a: 0, s: 0 };
      // Only answered suggestions count: one still waiting in the inbox says nothing yet.
      e.a += r?.accepted_count ?? 0;
      e.s += (r?.accepted_count ?? 0) + (r?.dismissed_count ?? 0);
      dom.set(t.domain, e);
    }

    const out: Candidate[] = [];
    for (const task of LIBRARY) {
      const r = st.get(task.id);
      if (r?.never || pending.has(task.id)) continue;
      if (r?.snoozed_until && toDay(r.snoozed_until)! > today) continue;
      if (task.requires?.some((id) => !(st.get(id)?.accepted_count))) continue;
      let w: { period: string; deadline: string | null; reason: string } | null;
      if (task.trigger.type === "condition") {
        const why = conds[task.trigger.check];
        const wd = weekdayOf(today);
        w = why ? { period: `w${addDays(today, -wd)}`, deadline: null, reason: why } : null;
      } else w = this.window(task.trigger, today, settings, st);
      if (!w) continue;
      if (ONE_OFF.has(task.trigger.type)) {
        if (r?.accepted_count) continue;
        const shown = toDay(r?.last_shown_at ?? null);
        if (shown && dayDiff(today, shown) < RESHOW_DAYS) continue;
      } else if (r?.last_period === w.period) continue;

      const d = dom.get(task.domain)!;
      let score = task.priority === 1 ? 40 : 20;
      if (w.deadline) {
        const left = dayDiff(w.deadline, today);
        score += left <= 2 ? 30 : left <= 7 ? 20 : left <= 21 ? 10 : 0;
      }
      score += 20 * ((d.a + 1) / (d.s + 2));
      if (task.requires?.length || task.trigger.type === "after") score += 5; // progression: the next step of something started
      if (r?.dismissed_count) score -= 5 * r.dismissed_count;
      score += parseInt(createHash("sha256").update(`${task.id}:${today}`).digest("hex").slice(0, 2), 16) / 64; // small daily variety
      out.push({ task, period: w.period, deadline: w.deadline, reason: w.reason, score });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /** Busy minutes on today's calendar, to keep big tasks off shift days. */
  private async busyMinutes(user: User, settings: Settings, today: string): Promise<number> {
    const agenda = await this.deps.agenda.forDay(user.id, settings.timezone, today);
    if (agenda.status !== "ok") return 0;
    return agenda.events.filter((e) => !e.allDay).reduce((s, e) => s + Math.max(0, (Date.parse(e.end) - Date.parse(e.start)) / 60000), 0);
  }

  private async proposedToday(userId: string, settings: Settings, now: Date): Promise<{ count: number; domains: Set<string> }> {
    const start = zonedToUtc(localParts(settings.timezone, now).date, "00:00", settings.timezone);
    const { rows } = await this.db.query<{ source_ref: string }>("SELECT source_ref FROM suggestions WHERE user_id = $1 AND source = 'library' AND created_at >= $2", [userId, start.toISOString()]);
    const domains = new Set(rows.map((r) => LIBRARY.find((t) => t.id === r.source_ref)?.domain ?? ""));
    return { count: rows.length, domains };
  }

  private async propose(user: User, c: Candidate, today: string): Promise<boolean> {
    const due = c.deadline && dayDiff(c.deadline, today) <= 30 ? c.deadline : addDays(today, c.task.effort === "S" ? 0 : c.task.effort === "M" ? 2 : 5);
    const habit = c.task.trigger.type === "habit";
    const s = await this.deps.suggestions.propose(
      user.id,
      {
        kind: "task",
        title: habit ? `Make it a habit: ${c.task.title}` : c.task.title,
        notes: `${c.task.why}. (${DOMAIN_LABELS[c.task.domain]} · effort ${c.task.effort} · library ${c.task.id})`,
        priority: c.task.priority === 1 || (c.deadline !== null && dayDiff(c.deadline, today) <= 3) ? 1 : 2,
        dueDate: due,
      },
      { source: "library", sourceRef: c.task.id, reason: `Why now: ${c.reason}. Why it matters: ${c.task.why}.` },
    );
    if (!s) return false;
    await this.db.query(
      `INSERT INTO library_state (user_id, task_id, shown_count, last_shown_at, last_period) VALUES ($1,$2,1,now(),$3)
       ON CONFLICT (user_id, task_id) DO UPDATE SET shown_count = library_state.shown_count + 1, last_shown_at = now(), last_period = EXCLUDED.last_period`,
      [user.id, c.task.id, c.period],
    );
    return true;
  }

  /**
   * The daily run: propose up to the remaining daily allowance, one per domain,
   * no L-effort task on a day with 6+ hours on the calendar.
   */
  async run(user: User, settings: Settings, now = new Date()): Promise<LibraryTask[]> {
    if (!settings.library.enabled) return [];
    const today = localParts(settings.timezone, now).date;
    const done = await this.proposedToday(user.id, settings, now);
    let left = settings.library.perDay - done.count;
    if (left <= 0) return [];
    const shiftDay = (await this.busyMinutes(user, settings, today)) >= 360;
    const picked: LibraryTask[] = [];
    for (const c of await this.candidates(user, settings, now)) {
      if (left <= 0) break;
      if (done.domains.has(c.task.domain)) continue;
      if (shiftDay && c.task.effort === "L") continue;
      if (await this.propose(user, c, today)) {
        picked.push(c.task);
        done.domains.add(c.task.domain);
        left--;
      }
    }
    if (picked.length) await audit(this.db, { userId: user.id, actor: "system", action: "library.suggested", details: { ids: picked.map((t) => t.id) } });
    return picked;
  }

  /** Oliver asked for this one now (Library page): no daily limit, but never a duplicate. */
  async suggestNow(user: User, settings: Settings, taskId: string, now = new Date()): Promise<void> {
    const task = LIBRARY.find((t) => t.id === taskId);
    if (!task) throw new UserFacingError("Unknown library task.", "not_found", 404);
    if ((await this.pendingIds(user.id)).has(taskId)) throw new UserFacingError("That one is already in your inbox.", "already_pending", 409);
    const today = localParts(settings.timezone, now).date;
    await this.db.query("UPDATE library_state SET never = false, snoozed_until = NULL WHERE user_id = $1 AND task_id = $2", [user.id, taskId]);
    const ok = await this.propose(user, { task, period: `manual-${today}`, deadline: null, reason: "You asked for it", score: 0 }, today);
    if (!ok) throw new UserFacingError("A suggestion with the same title is already waiting.", "already_pending", 409);
  }

  async restore(userId: string, taskId: string): Promise<void> {
    await this.db.query("UPDATE library_state SET never = false, snoozed_until = NULL WHERE user_id = $1 AND task_id = $2", [userId, taskId]);
  }

  /** Every task with where it stands, for the Library screen. */
  async overview(user: User, settings: Settings, now = new Date()): Promise<{ items: LibraryItemView[]; stats: Record<LibraryDomain, { accepted: number; answered: number }> }> {
    const today = localParts(settings.timezone, now).date;
    const st = await this.state(user.id);
    const pending = await this.pendingIds(user.id);
    const live = new Map((await this.candidates(user, settings, now)).map((c) => [c.task.id, c]));
    const stats = Object.fromEntries(Object.keys(DOMAIN_LABELS).map((k) => [k, { accepted: 0, answered: 0 }])) as Record<LibraryDomain, { accepted: number; answered: number }>;
    const items = LIBRARY.map((t): LibraryItemView => {
      const r = st.get(t.id);
      stats[t.domain].accepted += r?.accepted_count ?? 0;
      stats[t.domain].answered += (r?.accepted_count ?? 0) + (r?.dismissed_count ?? 0);
      const base = { ...t, acceptedCount: r?.accepted_count ?? 0 };
      if (r?.never) return { ...base, status: "never", statusText: "You said never" };
      if (pending.has(t.id)) return { ...base, status: "pending", statusText: "In your inbox now" };
      if (r?.snoozed_until && toDay(r.snoozed_until)! > today) return { ...base, status: "snoozed", statusText: `Not now: back after ${toDay(r.snoozed_until)}` };
      if (ONE_OFF.has(t.trigger.type) && r?.accepted_count) return { ...base, status: "accepted", statusText: "Accepted" };
      const missing = t.requires?.filter((id) => !st.get(id)?.accepted_count);
      if (missing?.length) return { ...base, status: "locked", statusText: `Unlocks after ${missing.join(", ")}` };
      const c = live.get(t.id);
      if (c) return { ...base, status: "eligible", statusText: `Ready: ${c.reason}` };
      if (r?.accepted_count) return { ...base, status: "done_for_now", statusText: `Accepted ${r.accepted_count}× · returns when due` };
      return { ...base, status: "waiting", statusText: `Waits for: ${t.when}` };
    });
    return { items, stats };
  }
}
