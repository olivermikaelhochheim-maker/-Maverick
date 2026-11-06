import type { Db } from "../db/types";
import { addDays } from "../util/time";

export type LibraryDecision = "accepted" | "not_now" | "never";
const SNOOZE_DAYS = 14;

/** Record Oliver's answer to a library suggestion (called from the suggestion inbox). */
export async function recordLibraryDecision(db: Db, userId: string, taskId: string, decision: LibraryDecision, today: string): Promise<void> {
  await db.query(
    `INSERT INTO library_state (user_id, task_id) VALUES ($1, $2) ON CONFLICT (user_id, task_id) DO NOTHING`,
    [userId, taskId],
  );
  if (decision === "accepted") {
    await db.query("UPDATE library_state SET accepted_count = accepted_count + 1, last_accepted_at = now(), snoozed_until = NULL WHERE user_id = $1 AND task_id = $2", [userId, taskId]);
  } else if (decision === "not_now") {
    await db.query("UPDATE library_state SET dismissed_count = dismissed_count + 1, snoozed_until = $3 WHERE user_id = $1 AND task_id = $2", [userId, taskId, addDays(today, SNOOZE_DAYS)]);
  } else {
    await db.query("UPDATE library_state SET dismissed_count = dismissed_count + 1, never = true WHERE user_id = $1 AND task_id = $2", [userId, taskId]);
  }
}

