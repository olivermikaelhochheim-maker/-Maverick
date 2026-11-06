export type LibraryDomain = "degree" | "pilot" | "zorza" | "money" | "physique" | "discipline" | "life";
export type Effort = "S" | "M" | "L";
export type AnchorName = "exam" | "exam2" | "pilotStart";
export type ConditionName = "subscriptions" | "low_energy" | "overdue_2d" | "no_activity_2d";

export type LibraryTrigger =
  /** One-off, any time. */
  | { type: "now" }
  /** One-off: adopt this as a habit. */
  | { type: "habit" }
  /** One-off, `days` after another library task was accepted. */
  | { type: "after"; id: string; days: number }
  /** One-off between two dates; `to` is the deadline. */
  | { type: "window"; from: string; to: string }
  /** One-off, `from`..`to` days relative to an anchor date set in Settings. */
  | { type: "anchor"; anchor: AnchorName; from: number; to: number }
  | { type: "yearly"; month: number; day: number }
  | { type: "monthly"; day: number | "first-sun" | "last-sun" | "last" }
  /** 0 = Sunday */
  | { type: "weekly"; weekday: number }
  | { type: "quarterly"; at: "start" | "end" }
  | { type: "every"; days: number }
  | { type: "condition"; check: ConditionName };

export interface LibraryTask {
  id: string;
  domain: LibraryDomain;
  title: string;
  why: string;
  /** The trigger as written in the document, shown to Oliver. */
  when: string;
  effort: Effort;
  trigger: LibraryTrigger;
  /** Only suggested after these tasks were accepted. */
  requires?: string[];
  /** 1 = deadline-bound or urgent. */
  priority?: 1;
}

export const DOMAIN_LABELS: Record<LibraryDomain, string> = {
  degree: "BI degree",
  pilot: "Pilot path",
  zorza: "Zorza Marketing",
  money: "Money & property",
  physique: "Physique & sleep",
  discipline: "Discipline & learning",
  life: "Family & life",
};
