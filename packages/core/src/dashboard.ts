import type { Db } from "./db/types";
import type { FieldCipher } from "./util/crypto";
import type { User } from "./auth";
import type { Settings } from "./settings";
import type { ChatDeps } from "./chat/service";
import type { CalendarEvent } from "./integrations/calendar";
import { formatEventTime } from "./integrations/calendar";
import { getSpend } from "./budget";
import { addDays, localParts, zonedToUtc } from "./util/time";

/**
 * Everything the Command Center shows, computed from Oliver's own data with no
 * model call: trends, streak, goal progress, spend projection, and rule-based
 * insights. Cheap enough to run on every page load.
 */

export interface DayPoint {
  date: string;
  tasksDone: number;
  focusMinutes: number;
  messages: number;
}

export interface Trend {
  value: number;
  previous: number;
  /** 14 daily values, oldest first */
  series: number[];
}

export interface GoalProgress {
  id: string;
  title: string;
  metric: string | null;
  done: number;
  total: number;
  open: number;
  targetDate: string | null;
  daysLeft: number | null;
}

export type InsightKind = "critical" | "warning" | "win" | "tip";

export interface Insight {
  kind: InsightKind;
  text: string;
  action?: { label: string; href: string };
}

export interface Dashboard {
  today: string;
  tasksDone7: Trend;
  focus7: Trend;
  messages7: Trend;
  streak: { current: number; best: number; activeToday: boolean };
  tasks: { open: number; overdue: number; dueToday: number; dueThisWeek: number };
  goals: GoalProgress[];
  activity: DayPoint[];
  spend: { monthUsd: number; projectedUsd: number; hardUsd: number; softUsd: number; daysElapsed: number; daysInMonth: number; dailyUsd: { date: string; usd: number }[] };
  nextEvent: { title: string; when: string; startsAt: string; minutesUntil: number } | null;
  /** Today's calendar, or why it isn't available */
  agenda: { status: string; events: { id: string; title: string; when: string; start: string; end: string; allDay: boolean; location: string | null }[] };
  /** Open tasks due today or overdue, most urgent first */
  dueNow: { id: string; title: string; dueDate: string; remindAt: string | null; priority: number; overdue: boolean }[];
  pendingSuggestions: number;
  memories: number;
  insights: Insight[];
  prompts: string[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export async function computeDashboard(
  db: Db,
  _cipher: FieldCipher,
  deps: ChatDeps,
  user: User,
  settings: Settings,
  now = new Date(),
): Promise<Dashboard> {
  const tz = settings.timezone;
  const local = localParts(tz, now);
  const today = local.date;
  const dayOf = (d: Date | string) => localParts(tz, new Date(d)).date;
  const start60 = zonedToUtc(addDays(today, -59), "00:00", tz);
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const days60 = Array.from({ length: 60 }, (_, i) => addDays(today, i - 59));

  const [completedRows, messageRows, focusSessions, openTasks, goals, pending, memories, agenda, spend] = await Promise.all([
    db.query<{ completed_at: Date | string; goal_id: string | null }>(
      "SELECT completed_at, goal_id FROM tasks WHERE user_id = $1 AND status = 'done' AND completed_at >= $2",
      [user.id, start60.toISOString()],
    ),
    db.query<{ created_at: Date | string }>(
      `SELECT m.created_at FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = $1 AND m.role = 'user' AND m.created_at >= $2`,
      [user.id, zonedToUtc(days14[0]!, "00:00", tz).toISOString()],
    ),
    deps.focus.sessionsSince(user.id, start60, now),
    deps.planning.listTasks(user.id, { status: "open", limit: 500 }),
    deps.planning.listGoals(user.id, { activeOnly: true }),
    deps.suggestions.list(user.id, "pending", 100),
    deps.memory.list(user.id),
    deps.agenda.forDay(user.id, tz, today),
    getSpend(db, user.id, settings, now),
  ]);

  // ----- Daily activity -----
  const tasksByDay = new Map<string, number>();
  const completionHours: number[] = [];
  for (const r of completedRows.rows) {
    const d = dayOf(r.completed_at);
    tasksByDay.set(d, (tasksByDay.get(d) ?? 0) + 1);
    completionHours.push(Math.floor(localParts(tz, new Date(r.completed_at)).minutes / 60));
  }
  const focusByDay = new Map<string, number>();
  for (const f of focusSessions) {
    const d = dayOf(f.startedAt);
    focusByDay.set(d, (focusByDay.get(d) ?? 0) + f.minutes);
  }
  const msgsByDay = new Map<string, number>();
  for (const r of messageRows.rows) {
    const d = dayOf(r.created_at);
    msgsByDay.set(d, (msgsByDay.get(d) ?? 0) + 1);
  }
  const activity: DayPoint[] = days14.map((date) => ({
    date,
    tasksDone: tasksByDay.get(date) ?? 0,
    focusMinutes: focusByDay.get(date) ?? 0,
    messages: msgsByDay.get(date) ?? 0,
  }));
  const trend = (pick: (d: DayPoint) => number): Trend => {
    const series = activity.map(pick);
    return { value: sum(series.slice(7)), previous: sum(series.slice(0, 7)), series };
  };

  // ----- Streak: days with a finished task or 10+ focus minutes -----
  const active = (d: string) => (tasksByDay.get(d) ?? 0) > 0 || (focusByDay.get(d) ?? 0) >= 10;
  const activeToday = active(today);
  let current = 0;
  for (let i = days60.length - (activeToday ? 1 : 2); i >= 0 && active(days60[i]!); i--) current++;
  let best = 0;
  let run = 0;
  for (const d of days60) {
    run = active(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }

  // ----- Tasks -----
  const weekEnd = addDays(today, 7);
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const dueToday = openTasks.filter((t) => t.dueDate === today);
  const dueThisWeek = openTasks.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= weekEnd);

  // ----- Goal progress from linked tasks -----
  const goalCounts = await db.query<{ goal_id: string; total: number | string; done: number | string }>(
    `SELECT goal_id, count(*) AS total, count(*) FILTER (WHERE status = 'done') AS done FROM tasks
     WHERE user_id = $1 AND goal_id IS NOT NULL AND status <> 'dropped' GROUP BY goal_id`,
    [user.id],
  );
  const counts = new Map(goalCounts.rows.map((r) => [r.goal_id, { total: Number(r.total), done: Number(r.done) }]));
  const goalProgress: GoalProgress[] = goals.map((g) => {
    const c = counts.get(g.id) ?? { total: 0, done: 0 };
    const daysLeft = g.targetDate ? Math.round((Date.parse(`${g.targetDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000) : null;
    return { id: g.id, title: g.title, metric: g.metric, done: c.done, total: c.total, open: c.total - c.done, targetDate: g.targetDate, daysLeft };
  });

  // ----- Spend projection (UTC months, matching the budget) -----
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysElapsed = now.getUTCDate();
  const projectedUsd = daysElapsed > 0 ? (spend.monthUsd / daysElapsed) * daysInMonth : 0;
  const spendRows = await db.query<{ day: string; usd: number | string }>(
    `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, SUM(cost_usd) AS usd FROM usage_events
     WHERE user_id = $1 AND created_at >= $2 GROUP BY 1`,
    [user.id, spend.periodStart],
  );
  const spendByDay = new Map(spendRows.rows.map((r) => [r.day, Number(r.usd)]));
  const monthPrefix = spend.periodStart.slice(0, 8);
  const dailyUsd = Array.from({ length: daysInMonth }, (_, i) => {
    const date = `${monthPrefix}${String(i + 1).padStart(2, "0")}`;
    return { date, usd: spendByDay.get(date) ?? 0 };
  });

  // ----- Next event -----
  let nextEvent: Dashboard["nextEvent"] = null;
  if (agenda.status === "ok") {
    const upcoming = agenda.events.filter((e: CalendarEvent) => !e.allDay && Date.parse(e.start) > now.getTime()).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (upcoming) {
      nextEvent = {
        title: upcoming.title,
        when: formatEventTime(upcoming, tz),
        startsAt: upcoming.start,
        minutesUntil: Math.round((Date.parse(upcoming.start) - now.getTime()) / 60000),
      };
    }
  }

  const tasksDone7 = trend((d) => d.tasksDone);
  const focus7 = trend((d) => d.focusMinutes);
  const messages7 = trend((d) => d.messages);

  // ----- Insights (rule-based, most important first, max 5) -----
  const insights: Insight[] = [];
  if (overdue.length) {
    const oldest = [...overdue].sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0]!;
    insights.push({
      kind: "critical",
      text: `${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}. Oldest: “${oldest.title}” (due ${oldest.dueDate}). Do it, reschedule it, or drop it.`,
      action: { label: "Review", href: "/planning" },
    });
  }
  const urgentSoon = openTasks
    .filter((t) => t.priority === 1 && t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
  if (urgentSoon) {
    const d = Math.round((Date.parse(`${urgentSoon.dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    insights.push({
      kind: "warning",
      text: `“${urgentSoon.title}” is ${d === 0 ? "due today" : d === 1 ? "due tomorrow" : `in ${d} days`}. Block time for it now.`,
      action: { label: "Plan it with Maverick", href: `/chat?q=${encodeURIComponent(`Help me prepare for "${urgentSoon.title}" (due ${urgentSoon.dueDate}). Make a short plan with time blocks.`)}` },
    });
  }
  for (const g of goalProgress) {
    if (g.daysLeft !== null && g.daysLeft >= 0 && g.daysLeft <= 30 && g.total > 0 && g.done / g.total < 0.5) {
      insights.push({ kind: "warning", text: `Goal “${g.title}” is due in ${g.daysLeft} days and ${Math.round((g.done / g.total) * 100)}% done.`, action: { label: "Open plan", href: "/planning" } });
      break;
    }
  }
  const stalled = goalProgress.find((g) => g.open === 0);
  if (stalled) {
    insights.push({ kind: "tip", text: `Goal “${stalled.title}” has no open next step. A goal without a next action tends to stall.`, action: { label: "Add one", href: "/planning" } });
  }
  if (!activeToday && local.minutes >= 10 * 60 && local.minutes < 21 * 60) {
    const top = openTasks[0];
    insights.push({
      kind: "tip",
      text: top ? `Nothing done yet today. 25 focused minutes on “${top.title}” is enough to start the day's streak.` : "Nothing done yet today. One small task is enough to keep momentum.",
      action: { label: "Start focus", href: "/#focus" },
    });
  }
  if (current >= 3) insights.push({ kind: "win", text: `${current}-day streak${current >= best ? ", your best yet" : ""}. Keep it alive today.` });
  if (tasksDone7.value > tasksDone7.previous && tasksDone7.previous > 0) {
    insights.push({ kind: "win", text: `You finished ${tasksDone7.value} tasks in the last 7 days, up from ${tasksDone7.previous}.` });
  }
  if (completionHours.length >= 5) {
    const buckets = { morning: 0, afternoon: 0, evening: 0 } as Record<string, number>;
    for (const h of completionHours) buckets[h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"]!++;
    const [best, n] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]!;
    if (n / completionHours.length >= 0.5) insights.push({ kind: "tip", text: `You finish most tasks in the ${best} (${Math.round((n / completionHours.length) * 100)}%). Put your hardest work there.` });
  }
  if (pending.length >= 3) insights.push({ kind: "tip", text: `${pending.length} suggestions are waiting for your decision.`, action: { label: "Review", href: "/planning#inbox" } });
  if (projectedUsd > spend.monthSoftUsd && daysElapsed >= 5) {
    insights.push({ kind: "warning", text: `At this pace, model spend reaches about $${projectedUsd.toFixed(0)} this month (soft limit $${spend.monthSoftUsd}).`, action: { label: "Usage", href: "/usage" } });
  }
  if (!goals.length) insights.push({ kind: "tip", text: "No goals recorded yet. Add your 2–3 most important ones so Maverick can prioritise for you.", action: { label: "Add goals", href: "/planning" } });
  const order: Record<InsightKind, number> = { critical: 0, warning: 1, win: 2, tip: 3 };
  insights.sort((a, b) => order[a.kind] - order[b.kind]);

  // ----- Conversation starters built from today -----
  const prompts: string[] = [];
  if (nextEvent) prompts.push(`Prepare me for “${nextEvent.title}” at ${nextEvent.when.split("–")[0]}`);
  if (overdue.length) prompts.push(`Help me deal with my ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}`);
  if (urgentSoon) prompts.push(`Make a plan for “${urgentSoon.title}”`);
  if (goalProgress[0]) prompts.push(`What's the next step towards “${goalProgress[0].title}”?`);
  prompts.push(local.minutes < 12 * 60 ? "Help me plan the most important outcome for today" : "Help me make the rest of today count");
  if (!activeToday) prompts.push("I'm procrastinating. Get me started.");

  return {
    today,
    tasksDone7,
    focus7,
    messages7,
    streak: { current, best, activeToday },
    tasks: { open: openTasks.length, overdue: overdue.length, dueToday: dueToday.length, dueThisWeek: dueThisWeek.length },
    goals: goalProgress,
    activity,
    spend: { monthUsd: spend.monthUsd, projectedUsd, hardUsd: spend.monthHardUsd, softUsd: spend.monthSoftUsd, daysElapsed, daysInMonth, dailyUsd },
    nextEvent,
    agenda: {
      status: agenda.status,
      events: agenda.events.map((e) => ({ id: e.id, title: e.title, when: formatEventTime(e, tz), start: e.start, end: e.end, allDay: e.allDay, location: e.location })),
    },
    dueNow: [...overdue, ...dueToday].map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate!, remindAt: t.remindAt, priority: t.priority, overdue: t.dueDate! < today })),
    pendingSuggestions: pending.length,
    memories: memories.length,
    insights: insights.slice(0, 5),
    prompts: [...new Set(prompts)].slice(0, 4),
  };
}
