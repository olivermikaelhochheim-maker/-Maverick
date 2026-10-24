import { randomUUID } from "node:crypto";
import type { Db } from "../db/types";
import type { FieldCipher } from "../util/crypto";
import { audit } from "../audit";
import { UserFacingError } from "../util/errors";

export const HORIZONS = ["1y", "3y", "5y", "personal", "other"] as const;
export type Horizon = (typeof HORIZONS)[number];
export type GoalStatus = "active" | "done" | "paused" | "dropped";
export type TaskStatus = "open" | "done" | "dropped";

export interface Goal {
  id: string;
  title: string;
  detail: string | null;
  metric: string | null;
  horizon: Horizon;
  targetDate: string | null;
  status: GoalStatus;
  createdAt: string;
}

export interface Task {
  id: string;
  goalId: string | null;
  title: string;
  notes: string | null;
  priority: 1 | 2 | 3;
  dueDate: string | null;
  remindAt: string | null;
  status: TaskStatus;
  source: "user" | "suggestion";
  createdAt: string;
  completedAt: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
// DATE columns come back as Date at UTC midnight (pg) or strings (PGlite); normalise to YYYY-MM-DD.
const day = (d: Date | string | null | undefined) =>
  d ? (typeof d === "string" ? d.slice(0, 10) : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)) : null;

function text(v: unknown, label: string, max: number, required = false): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) throw new UserFacingError(`${label} is required.`, "bad_input");
    return null;
  }
  if (typeof v !== "string") throw new UserFacingError(`${label} must be text.`, "bad_input");
  const t = v.trim();
  if (required && !t) throw new UserFacingError(`${label} is required.`, "bad_input");
  if (t.length > max) throw new UserFacingError(`${label} is too long (max ${max} characters).`, "bad_input");
  return t || null;
}

function date(v: unknown, label: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !DATE.test(v)) throw new UserFacingError(`${label} must be a date like 2026-11-30.`, "bad_input");
  return v;
}

export class PlanningStore {
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

  // ---------- Goals ----------

  async createGoal(
    userId: string,
    input: { title: unknown; detail?: unknown; metric?: unknown; horizon?: unknown; targetDate?: unknown },
    actor: "user" | "system" = "user",
  ): Promise<Goal> {
    const title = text(input.title, "Goal", 200, true)!;
    const horizon = (input.horizon ?? "other") as Horizon;
    if (!HORIZONS.includes(horizon)) throw new UserFacingError("Unknown goal horizon.", "bad_input");
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO goals (id, user_id, title_enc, detail_enc, metric_enc, horizon, target_date) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [id, userId, this.cipher.encrypt(title), this.enc(text(input.detail, "Detail", 2000)), this.enc(text(input.metric, "Metric", 300)), horizon, date(input.targetDate, "Target date")],
    );
    await audit(this.db, { userId, actor, action: "goal.created", target: id });
    return (await this.getGoal(userId, id))!;
  }

  async getGoal(userId: string, id: string): Promise<Goal | null> {
    const { rows } = await this.db.query<GoalRow>("SELECT * FROM goals WHERE id = $1 AND user_id = $2", [id, userId]);
    return rows[0] ? this.toGoal(rows[0]) : null;
  }

  async listGoals(userId: string, opts: { activeOnly?: boolean } = {}): Promise<Goal[]> {
    const { rows } = await this.db.query<GoalRow>(
      `SELECT * FROM goals WHERE user_id = $1 ${opts.activeOnly ? "AND status = 'active'" : ""}
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, created_at`,
      [userId],
    );
    return rows.map((r) => this.toGoal(r));
  }

  async updateGoal(
    userId: string,
    id: string,
    patch: { title?: unknown; detail?: unknown; metric?: unknown; horizon?: unknown; targetDate?: unknown; status?: unknown },
  ): Promise<Goal> {
    const g = await this.getGoal(userId, id);
    if (!g) throw new UserFacingError("Goal not found.", "not_found", 404);
    const status = (patch.status ?? g.status) as GoalStatus;
    if (!["active", "done", "paused", "dropped"].includes(status)) throw new UserFacingError("Unknown goal status.", "bad_input");
    const horizon = (patch.horizon ?? g.horizon) as Horizon;
    if (!HORIZONS.includes(horizon)) throw new UserFacingError("Unknown goal horizon.", "bad_input");
    await this.db.query(
      `UPDATE goals SET title_enc=$1, detail_enc=$2, metric_enc=$3, horizon=$4, target_date=$5, status=$6, updated_at=now()
       WHERE id=$7 AND user_id=$8`,
      [
        this.cipher.encrypt(patch.title !== undefined ? text(patch.title, "Goal", 200, true)! : g.title),
        this.enc(patch.detail !== undefined ? text(patch.detail, "Detail", 2000) : g.detail),
        this.enc(patch.metric !== undefined ? text(patch.metric, "Metric", 300) : g.metric),
        horizon,
        patch.targetDate !== undefined ? date(patch.targetDate, "Target date") : g.targetDate,
        status,
        id,
        userId,
      ],
    );
    await audit(this.db, { userId, actor: "user", action: "goal.updated", target: id, details: { fields: Object.keys(patch) } });
    return (await this.getGoal(userId, id))!;
  }

  async deleteGoal(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query("DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    if (!rows.length) throw new UserFacingError("Goal not found.", "not_found", 404);
    await audit(this.db, { userId, actor: "user", action: "goal.deleted", target: id });
  }

  private toGoal(r: GoalRow): Goal {
    return {
      id: r.id,
      title: this.cipher.decrypt(r.title_enc),
      detail: this.dec(r.detail_enc),
      metric: this.dec(r.metric_enc),
      horizon: r.horizon,
      targetDate: day(r.target_date),
      status: r.status,
      createdAt: iso(r.created_at)!,
    };
  }

  // ---------- Tasks ----------

  async createTask(
    userId: string,
    input: { title: unknown; notes?: unknown; priority?: unknown; dueDate?: unknown; remindAt?: unknown; goalId?: unknown },
    source: "user" | "suggestion" = "user",
  ): Promise<Task> {
    const title = text(input.title, "Task", 300, true)!;
    const priority = input.priority === undefined ? 2 : Number(input.priority);
    if (![1, 2, 3].includes(priority)) throw new UserFacingError("Priority must be 1 (high), 2 or 3 (low).", "bad_input");
    const goalId = await this.checkGoal(userId, input.goalId);
    const remindAt = this.remind(input.remindAt);
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO tasks (id, user_id, goal_id, title_enc, notes_enc, priority, due_date, remind_at, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, userId, goalId, this.cipher.encrypt(title), this.enc(text(input.notes, "Notes", 2000)), priority, date(input.dueDate, "Due date"), remindAt, source],
    );
    await audit(this.db, { userId, actor: source === "user" ? "user" : "system", action: "task.created", target: id, details: { source } });
    return (await this.getTask(userId, id))!;
  }

  async getTask(userId: string, id: string): Promise<Task | null> {
    const { rows } = await this.db.query<TaskRow>("SELECT * FROM tasks WHERE id = $1 AND user_id = $2", [id, userId]);
    return rows[0] ? this.toTask(rows[0]) : null;
  }

  /** Open tasks ranked: overdue/due soonest first, then priority. */
  async listTasks(userId: string, opts: { status?: TaskStatus | "all"; limit?: number } = {}): Promise<Task[]> {
    const status = opts.status ?? "open";
    const { rows } = await this.db.query<TaskRow>(
      `SELECT * FROM tasks WHERE user_id = $1 ${status === "all" ? "" : "AND status = $3"}
       ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, due_date ASC NULLS LAST, priority ASC, created_at ASC LIMIT $2`,
      status === "all" ? [userId, opts.limit ?? 200] : [userId, opts.limit ?? 200, status],
    );
    return rows.map((r) => this.toTask(r));
  }

  async updateTask(
    userId: string,
    id: string,
    patch: { title?: unknown; notes?: unknown; priority?: unknown; dueDate?: unknown; remindAt?: unknown; goalId?: unknown; status?: unknown },
  ): Promise<Task> {
    const t = await this.getTask(userId, id);
    if (!t) throw new UserFacingError("Task not found.", "not_found", 404);
    const status = (patch.status ?? t.status) as TaskStatus;
    if (!["open", "done", "dropped"].includes(status)) throw new UserFacingError("Unknown task status.", "bad_input");
    const priority = patch.priority !== undefined ? Number(patch.priority) : t.priority;
    if (![1, 2, 3].includes(priority)) throw new UserFacingError("Priority must be 1, 2 or 3.", "bad_input");
    const remindAt = patch.remindAt !== undefined ? this.remind(patch.remindAt) : t.remindAt;
    await this.db.query(
      `UPDATE tasks SET title_enc=$1, notes_enc=$2, priority=$3, due_date=$4, remind_at=$5, goal_id=$6, status=$7,
         reminded_at = CASE WHEN $5::timestamptz IS DISTINCT FROM remind_at THEN NULL ELSE reminded_at END,
         completed_at = CASE WHEN $7 = 'done' AND status <> 'done' THEN now() WHEN $7 <> 'done' THEN NULL ELSE completed_at END,
         updated_at = now()
       WHERE id=$8 AND user_id=$9`,
      [
        this.cipher.encrypt(patch.title !== undefined ? text(patch.title, "Task", 300, true)! : t.title),
        this.enc(patch.notes !== undefined ? text(patch.notes, "Notes", 2000) : t.notes),
        priority,
        patch.dueDate !== undefined ? date(patch.dueDate, "Due date") : t.dueDate,
        remindAt,
        patch.goalId !== undefined ? await this.checkGoal(userId, patch.goalId) : t.goalId,
        status,
        id,
        userId,
      ],
    );
    await audit(this.db, { userId, actor: "user", action: status === "done" && t.status !== "done" ? "task.completed" : "task.updated", target: id });
    return (await this.getTask(userId, id))!;
  }

  async deleteTask(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query("DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    if (!rows.length) throw new UserFacingError("Task not found.", "not_found", 404);
    await audit(this.db, { userId, actor: "user", action: "task.deleted", target: id });
  }

  /** Tasks whose reminder time has passed and haven't been reminded yet. */
  async dueReminders(now = new Date()): Promise<(Task & { userId: string })[]> {
    const { rows } = await this.db.query<TaskRow>(
      "SELECT * FROM tasks WHERE status = 'open' AND reminded_at IS NULL AND remind_at IS NOT NULL AND remind_at <= $1",
      [now.toISOString()],
    );
    return rows.map((r) => ({ ...this.toTask(r), userId: r.user_id }));
  }

  async markReminded(id: string): Promise<void> {
    await this.db.query("UPDATE tasks SET reminded_at = now() WHERE id = $1", [id]);
  }

  async completedSince(userId: string, since: Date): Promise<Task[]> {
    const { rows } = await this.db.query<TaskRow>(
      "SELECT * FROM tasks WHERE user_id = $1 AND status = 'done' AND completed_at >= $2 ORDER BY completed_at",
      [userId, since.toISOString()],
    );
    return rows.map((r) => this.toTask(r));
  }

  private remind(v: unknown): string | null {
    if (v === undefined || v === null || v === "") return null;
    const d = typeof v === "string" ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) throw new UserFacingError("Reminder time is invalid.", "bad_input");
    return d.toISOString();
  }

  private async checkGoal(userId: string, goalId: unknown): Promise<string | null> {
    if (goalId === undefined || goalId === null || goalId === "") return null;
    if (typeof goalId !== "string" || !(await this.getGoal(userId, goalId))) throw new UserFacingError("Linked goal not found.", "bad_input");
    return goalId;
  }

  private toTask(r: TaskRow): Task {
    return {
      id: r.id,
      goalId: r.goal_id,
      title: this.cipher.decrypt(r.title_enc),
      notes: this.dec(r.notes_enc),
      priority: r.priority as 1 | 2 | 3,
      dueDate: day(r.due_date),
      remindAt: iso(r.remind_at),
      status: r.status,
      source: r.source,
      createdAt: iso(r.created_at)!,
      completedAt: iso(r.completed_at),
    };
  }
}

type GoalRow = {
  id: string;
  title_enc: string;
  detail_enc: string | null;
  metric_enc: string | null;
  horizon: Horizon;
  target_date: Date | string | null;
  status: GoalStatus;
  created_at: Date | string;
};

type TaskRow = {
  id: string;
  user_id: string;
  goal_id: string | null;
  title_enc: string;
  notes_enc: string | null;
  priority: number;
  due_date: Date | string | null;
  remind_at: Date | string | null;
  status: TaskStatus;
  source: "user" | "suggestion";
  created_at: Date | string;
  completed_at: Date | string | null;
};
