import { randomUUID } from "node:crypto";
import type { Db } from "./db/types";
import { audit } from "./audit";
import { UserFacingError } from "./util/errors";

/**
 * Focus sessions: a timer Oliver starts on one task. Sessions that run past
 * their planned length without being stopped are closed automatically and
 * counted up to the planned length, so a forgotten timer doesn't inflate stats.
 */

export interface FocusSession {
  id: string;
  taskId: string | null;
  plannedMinutes: number;
  startedAt: string;
  endedAt: string | null;
  completed: boolean;
}

type Row = { id: string; task_id: string | null; planned_minutes: number; started_at: Date | string; ended_at: Date | string | null; completed: boolean };
const toSession = (r: Row): FocusSession => ({
  id: r.id,
  taskId: r.task_id,
  plannedMinutes: Number(r.planned_minutes),
  startedAt: new Date(r.started_at).toISOString(),
  endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
  completed: r.completed,
});

export class FocusStore {
  constructor(private readonly db: Db) {}

  /** Close sessions whose time ran out while nobody was looking. */
  private async settle(userId: string, now: Date) {
    await this.db.query(
      `UPDATE focus_sessions SET ended_at = started_at + (planned_minutes || ' minutes')::interval, completed = true
       WHERE user_id = $1 AND ended_at IS NULL AND started_at + (planned_minutes || ' minutes')::interval <= $2`,
      [userId, now.toISOString()],
    );
  }

  async active(userId: string, now = new Date()): Promise<FocusSession | null> {
    await this.settle(userId, now);
    const { rows } = await this.db.query<Row>("SELECT * FROM focus_sessions WHERE user_id = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1", [userId]);
    return rows[0] ? toSession(rows[0]) : null;
  }

  async start(userId: string, input: { minutes?: unknown; taskId?: unknown }, now = new Date()): Promise<FocusSession> {
    const minutes = input.minutes === undefined ? 25 : Number(input.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) throw new UserFacingError("Focus length must be 1–240 minutes.", "bad_input");
    let taskId: string | null = null;
    if (typeof input.taskId === "string" && input.taskId) {
      const { rows } = await this.db.query("SELECT 1 FROM tasks WHERE id = $1 AND user_id = $2", [input.taskId, userId]);
      if (!rows.length) throw new UserFacingError("Task not found.", "not_found", 404);
      taskId = input.taskId;
    }
    if (await this.active(userId, now)) throw new UserFacingError("A focus session is already running.", "already_running", 409);
    const id = randomUUID();
    await this.db.query("INSERT INTO focus_sessions (id, user_id, task_id, planned_minutes, started_at) VALUES ($1,$2,$3,$4,$5)", [
      id,
      userId,
      taskId,
      minutes,
      now.toISOString(),
    ]);
    await audit(this.db, { userId, actor: "user", action: "focus.started", target: id, details: { minutes } });
    return (await this.active(userId, now))!;
  }

  /** Stop the running session. `completed` = Oliver finished it (vs. abandoned). */
  async stop(userId: string, completed: boolean, now = new Date()): Promise<FocusSession | null> {
    const current = await this.active(userId, now);
    if (!current) return null;
    await this.db.query("UPDATE focus_sessions SET ended_at = $1, completed = $2 WHERE id = $3", [now.toISOString(), completed, current.id]);
    await audit(this.db, { userId, actor: "user", action: completed ? "focus.completed" : "focus.stopped", target: current.id });
    const { rows } = await this.db.query<Row>("SELECT * FROM focus_sessions WHERE id = $1", [current.id]);
    return toSession(rows[0]!);
  }

  /** Minutes focused per session in a time range (running sessions count up to now). */
  async sessionsSince(userId: string, since: Date, now = new Date()): Promise<{ startedAt: Date; minutes: number; completed: boolean }[]> {
    await this.settle(userId, now);
    const { rows } = await this.db.query<Row>("SELECT * FROM focus_sessions WHERE user_id = $1 AND started_at >= $2 ORDER BY started_at", [
      userId,
      since.toISOString(),
    ]);
    return rows.map((r) => {
      const start = new Date(r.started_at);
      const end = r.ended_at ? new Date(r.ended_at) : now;
      return { startedAt: start, minutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)), completed: r.completed };
    });
  }
}
