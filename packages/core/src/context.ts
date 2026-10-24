import type { Settings } from "./settings";
import type { PlanningStore, Goal, Task } from "./planning";
import type { SuggestionStore } from "./suggestions";
import type { AgendaService, Agenda } from "./integrations/calendar";
import { renderAgenda } from "./integrations/calendar";
import { localParts } from "./util/time";

export interface StateSnapshot {
  localDate: string;
  goals: Goal[];
  tasks: Task[];
  pendingSuggestions: number;
  agenda: Agenda;
}

/** Gather Oliver's current state: goals, open tasks, today's calendar, pending inbox. */
export async function snapshot(
  deps: { planning: PlanningStore; suggestions: SuggestionStore; agenda: AgendaService },
  userId: string,
  settings: Settings,
  now = new Date(),
): Promise<StateSnapshot> {
  const localDate = localParts(settings.timezone, now).date;
  const [goals, tasks, pending, agenda] = await Promise.all([
    deps.planning.listGoals(userId, { activeOnly: true }),
    deps.planning.listTasks(userId, { status: "open", limit: 12 }),
    deps.suggestions.list(userId, "pending", 50),
    deps.agenda.forDay(userId, settings.timezone, localDate),
  ]);
  return { localDate, goals, tasks, pendingSuggestions: pending.length, agenda };
}

/** Compact text for the model. Kept short: it is sent with every message. */
export function renderState(s: StateSnapshot, tz: string, name = "Oliver"): string {
  const parts: string[] = [];
  parts.push(
    s.goals.length
      ? `${name}'s active goals:\n${s.goals.slice(0, 8).map((g) => `- ${g.title}${g.metric ? ` (metric: ${g.metric})` : ""}${g.targetDate ? ` by ${g.targetDate}` : ""}`).join("\n")}`
      : `${name}'s active goals: none recorded yet.`,
  );
  if (s.tasks.length) {
    const overdue = (t: Task) => (t.dueDate && t.dueDate < s.localDate ? " OVERDUE" : "");
    parts.push(
      `Open tasks (most urgent first):\n${s.tasks
        .slice(0, 8)
        .map((t) => `- [P${t.priority}] ${t.title}${t.dueDate ? ` (due ${t.dueDate}${overdue(t)})` : ""}`)
        .join("\n")}`,
    );
  } else parts.push("Open tasks: none.");
  parts.push(renderAgenda(s.agenda, tz));
  if (s.pendingSuggestions) parts.push(`Suggestions waiting in ${name}'s inbox: ${s.pendingSuggestions}.`);
  return parts.join("\n\n");
}
