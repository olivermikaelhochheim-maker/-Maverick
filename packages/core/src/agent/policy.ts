import type { AutonomyMode, ToolOverride } from "../settings";

/**
 * The single place that decides whether a step may run on its own.
 *
 *   mode            read   low                     medium                 high / external
 *   1 Advisory      run    recommend               recommend              recommend
 *   2 Assisted      run    approve                 approve                approve
 *   3 Autonomous    run    auto (within limit)     approve                approve
 *   4 Autopilot     run    auto (within limit)     auto if tool allows    approve, always
 *
 * Per-tool overrides: "off" blocks, "approve" forces approval, "auto" lets a
 * low or medium tool run without asking in modes 2-4. Overrides can never
 * loosen a high-risk tool. Emergency stop blocks everything.
 */

export type Risk = "read" | "low" | "medium" | "high";
export type Decision = "auto" | "approve" | "recommend" | "blocked";

export const MODE_NAMES: Record<AutonomyMode, string> = {
  1: "Advisory",
  2: "Assisted",
  3: "Autonomous",
  4: "Autopilot",
};

export const MODE_SUMMARIES: Record<AutonomyMode, string> = {
  1: "Maverick reads and recommends. He changes nothing.",
  2: "Maverick reads on his own and asks before every change.",
  3: "Maverick makes low-risk changes inside Maverick (tasks, reminders, reports, drafts) on his own, up to a daily limit. Anything bigger waits for you.",
  4: "Like Autonomous, plus medium-risk tools you've allowed. Anything high-risk or external still waits for you.",
};

export interface PolicyInput {
  mode: AutonomyMode;
  risk: Risk;
  override?: ToolOverride;
  halted: boolean;
  /** Whether this tool may run unattended in Autopilot when medium risk. */
  autopilotOk: boolean;
  /** Automatic (non-read) actions already taken today, and the daily cap. */
  autoActionsToday: number;
  dailyAutoActions: number;
}

export interface PolicyResult {
  decision: Decision;
  reason: string;
}

export function decide(p: PolicyInput): PolicyResult {
  if (p.halted) return { decision: "blocked", reason: "Emergency stop is on." };
  if (p.override === "off") return { decision: "blocked", reason: "This tool is switched off in Permissions." };
  if (p.risk === "read") return { decision: "auto", reason: "Reading only; nothing changes." };
  if (p.mode === 1) return { decision: "recommend", reason: "Advisory mode: recommended, not executed." };
  if (p.risk === "high") return { decision: "approve", reason: "High-risk actions always need your approval." };
  if (p.override === "approve") return { decision: "approve", reason: "You've set this tool to always ask." };

  const underLimit = p.autoActionsToday < p.dailyAutoActions;
  const limitReason = `Daily limit of ${p.dailyAutoActions} automatic actions reached.`;
  if (p.override === "auto") {
    return underLimit ? { decision: "auto", reason: "You've allowed this tool to run without asking." } : { decision: "approve", reason: limitReason };
  }
  if (p.mode === 2) return { decision: "approve", reason: "Assisted mode: every change needs your approval." };
  if (p.risk === "low") {
    return underLimit ? { decision: "auto", reason: `${p.mode === 3 ? "Autonomous" : "Autopilot"} mode allows low-risk internal changes.` } : { decision: "approve", reason: limitReason };
  }
  // medium
  if (p.mode === 4 && p.autopilotOk) {
    return underLimit ? { decision: "auto", reason: "Autopilot allows this medium-risk tool." } : { decision: "approve", reason: limitReason };
  }
  return { decision: "approve", reason: "Medium-risk: needs your approval in this mode." };
}

/** A mission may run at a lower mode than the global one, never higher. */
export function effectiveMode(global: AutonomyMode, mission: number): AutonomyMode {
  return Math.max(1, Math.min(global, mission)) as AutonomyMode;
}
