import type { Db } from "./db/types";
import { redact } from "./util/logger";

export type AuditActor = "user" | "system" | "assistant";

export interface AuditEntry {
  id: number;
  actor: AuditActor;
  action: string;
  target: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

/** Append an entry to the audit log. Details are redacted before storage. */
export async function audit(
  db: Db,
  entry: { userId?: string | null; actor: AuditActor; action: string; target?: string; details?: Record<string, unknown>; ipHash?: string },
): Promise<void> {
  await db.query(
    "INSERT INTO audit_log (user_id, actor, action, target, details, ip_hash) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      entry.userId ?? null,
      entry.actor,
      entry.action,
      entry.target ?? null,
      JSON.stringify(redact(entry.details ?? {})),
      entry.ipHash ?? null,
    ],
  );
}

export async function listAudit(db: Db, userId: string, limit = 100): Promise<AuditEntry[]> {
  const { rows } = await db.query<{
    id: number;
    actor: AuditActor;
    action: string;
    target: string | null;
    details: Record<string, unknown> | string;
    created_at: Date | string;
  }>(
    `SELECT id, actor, action, target, details, created_at FROM audit_log
     WHERE user_id = $1 OR user_id IS NULL ORDER BY created_at DESC, id DESC LIMIT $2`,
    [userId, Math.min(Math.max(limit, 1), 500)],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    actor: r.actor,
    action: r.action,
    target: r.target,
    details: typeof r.details === "string" ? JSON.parse(r.details) : r.details,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
