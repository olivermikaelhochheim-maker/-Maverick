import { UserFacingError } from "../util/errors";

/**
 * Deterministic mission plans. A plan is fixed when the mission is created:
 * nothing a tool reads (calendar text, web pages, files) can add steps.
 */

export interface PlannedStep {
  tool: string;
  title: string;
  input: Record<string, unknown>;
}

export interface MissionPlan {
  template: string;
  title: string;
  objective: string;
  criteria: string;
  steps: PlannedStep[];
}

export interface TemplateDef {
  id: string;
  label: string;
  description: string;
  /** Parameters Oliver can fill in; empty when none. */
  params: { key: string; label: string; required: boolean; placeholder?: string }[];
  build(params: Record<string, string>): MissionPlan;
}

const p = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const TEMPLATES: TemplateDef[] = [
  {
    id: "prepare_tomorrow",
    label: "Prepare me for tomorrow",
    description: "Reads tomorrow's calendar, tasks and free time, sets an evening review reminder, and reports how ready you are.",
    params: [],
    build: () => ({
      template: "prepare_tomorrow",
      title: "Prepare for tomorrow",
      objective: "Be ready for tomorrow: know the schedule, the priorities and the free time, with nothing overdue hanging over the day.",
      criteria: "Tomorrow's events, due tasks, overdue tasks and free time are known; a review reminder is set for this evening; a readiness report is written.",
      steps: [
        { tool: "calendar.read", title: "Read tomorrow's calendar", input: { day: "tomorrow" } },
        { tool: "tasks.review", title: "Tasks due tomorrow", input: { scope: "due_tomorrow" } },
        { tool: "tasks.review", title: "Overdue tasks", input: { scope: "overdue" } },
        { tool: "schedule.analyze", title: "Free time tomorrow", input: { day: "tomorrow" } },
        { tool: "tasks.create", title: "Evening review reminder", input: { title: "Review tomorrow's plan (10 min)", dueDate: "today", priority: 2, remindAt: "20:30" } },
        { tool: "report.compose", title: "Readiness report", input: { kind: "readiness" } },
      ],
    }),
  },
  {
    id: "situation_report",
    label: "Situation report",
    description: "Systems check plus today's schedule, open tasks, goals, money and health in one report.",
    params: [],
    build: () => ({
      template: "situation_report",
      title: "Situation report",
      objective: "A complete picture of where things stand right now.",
      criteria: "Every domain checked; gaps named; a report is written.",
      steps: [
        { tool: "system.check", title: "Systems check", input: {} },
        { tool: "calendar.read", title: "Today's calendar", input: { day: "today" } },
        { tool: "tasks.review", title: "Overdue tasks", input: { scope: "overdue" } },
        { tool: "tasks.review", title: "Due today", input: { scope: "due_today" } },
        { tool: "goals.review", title: "Goals", input: {} },
        { tool: "finance.summary", title: "Finance", input: {} },
        { tool: "health.summary", title: "Health", input: {} },
        { tool: "report.compose", title: "Situation report", input: { kind: "situation" } },
      ],
    }),
  },
  {
    id: "clear_overdue",
    label: "Clear the overdue backlog",
    description: "Lists overdue tasks and moves them all to today (a bulk change that needs approval in most modes).",
    params: [],
    build: () => ({
      template: "clear_overdue",
      title: "Clear overdue backlog",
      objective: "No task is overdue; everything outstanding has a date you can act on.",
      criteria: "All overdue tasks rescheduled to today, or the step left for your decision.",
      steps: [
        { tool: "tasks.review", title: "Overdue tasks", input: { scope: "overdue" } },
        { tool: "tasks.reschedule_overdue", title: "Move overdue tasks to today", input: { to: "today" } },
        { tool: "report.compose", title: "Backlog report", input: { kind: "general" } },
      ],
    }),
  },
  {
    id: "weekly_review",
    label: "Weekly performance review",
    description: "What got done, focus, goals, money and health over the last 7 days.",
    params: [],
    build: () => ({
      template: "weekly_review",
      title: "Weekly performance review",
      objective: "An honest review of the last 7 days and what to change next week.",
      criteria: "Completed tasks, focus, goals, finance and health reviewed; report written.",
      steps: [
        { tool: "tasks.review", title: "Completed this week", input: { scope: "done_7d" } },
        { tool: "tasks.review", title: "Still overdue", input: { scope: "overdue" } },
        { tool: "focus.summary", title: "Focus", input: {} },
        { tool: "goals.review", title: "Goals", input: {} },
        { tool: "finance.summary", title: "Finance", input: {} },
        { tool: "health.summary", title: "Health", input: {} },
        { tool: "report.compose", title: "Weekly review", input: { kind: "review" } },
      ],
    }),
  },
  {
    id: "research_brief",
    label: "Research brief",
    description: "Checks what Maverick already knows, researches the web (live model only), and writes a brief.",
    params: [{ key: "question", label: "Research question", required: true, placeholder: "e.g. Integrated ATPL schools in Norway: cost and entry requirements" }],
    build: (params) => {
      const q = p(params.question);
      if (!q) throw new UserFacingError("Give the research question.", "bad_input");
      return {
        template: "research_brief",
        title: `Research: ${q.slice(0, 80)}`,
        objective: `Answer: ${q}`,
        criteria: "A sourced answer, with what Maverick already knew, in a short brief.",
        steps: [
          { tool: "memory.recall", title: "What Maverick already knows", input: { query: q } },
          { tool: "research.web", title: "Web research", input: { question: q } },
          { tool: "report.compose", title: "Research brief", input: { kind: "research" } },
        ],
      };
    },
  },
  {
    id: "draft_email",
    label: "Draft an email",
    description: "Writes an email draft for your review in Communications. Maverick never sends it.",
    params: [
      { key: "subject", label: "Subject", required: true, placeholder: "e.g. Follow-up on our call" },
      { key: "purpose", label: "What it should say or achieve", required: true, placeholder: "e.g. thank them, propose a meeting next week" },
      { key: "to", label: "To (optional)", required: false, placeholder: "name@example.com" },
    ],
    build: (params) => {
      const subject = p(params.subject);
      const purpose = p(params.purpose);
      if (!subject || !purpose) throw new UserFacingError("Give a subject and what the email should achieve.", "bad_input");
      return {
        template: "draft_email",
        title: `Draft: ${subject.slice(0, 80)}`,
        objective: purpose,
        criteria: "A draft ready for your review in Communications. Not sent.",
        steps: [
          { tool: "memory.recall", title: "Relevant context", input: { query: `${subject} ${purpose}` } },
          { tool: "comms.draft", title: "Write the draft", input: { to: p(params.to), subject, purpose } },
          { tool: "report.compose", title: "Summary", input: { kind: "general" } },
        ],
      };
    },
  },
];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Free-form objective without a model: a safe read-only plan that gathers context. */
export function genericPlan(objective: string): MissionPlan {
  return {
    template: "custom",
    title: objective.slice(0, 90),
    objective,
    criteria: "Relevant context gathered and summarised.",
    steps: [
      { tool: "memory.recall", title: "Relevant memories", input: { query: objective } },
      { tool: "tasks.review", title: "Open tasks", input: { scope: "open" } },
      { tool: "goals.review", title: "Goals", input: {} },
      { tool: "report.compose", title: "Report", input: { kind: "general" } },
    ],
  };
}

/**
 * Route a spoken or typed command to a mission template. Returns null when it
 * isn't a mission command (then it goes to conversation instead).
 */
export function matchIntent(text: string): { template: string; params: Record<string, string> } | null {
  const t = text
    .toLowerCase()
    .replace(/^\s*(hey\s+)?maverick[,:!.\s]*/i, "")
    .replace(/[?!.]+$/, "")
    .trim();
  if (!t) return null;
  const research = /^(research|look into|find out( about)?|investigate)\s+(.{4,})$/.exec(t);
  if (research) return { template: "research_brief", params: { question: text.trim().replace(/^\s*(hey\s+)?maverick[,:!.\s]*/i, "").replace(/^(research|look into|find out( about)?|investigate)\s+/i, "") } };
  if (/(prepare|prep|get) (me )?(ready )?(for )?tomorrow|tomorrow'?s briefing|plan (for )?tomorrow|ready for tomorrow/.test(t)) return { template: "prepare_tomorrow", params: {} };
  if (/(situation|status|sit) ?rep(ort)?|systems? (check|status)|where (do )?(things|we) stand|run diagnostics/.test(t)) return { template: "situation_report", params: {} };
  if (/(weekly|week'?s?) (performance )?review|review (my|the|this) week|analy[sz]e my (week|productivity|performance)/.test(t)) return { template: "weekly_review", params: {} };
  if (/(clear|fix|sort( out)?|reschedule) (my |the )?(overdue|backlog)/.test(t)) return { template: "clear_overdue", params: {} };
  return null;
}
