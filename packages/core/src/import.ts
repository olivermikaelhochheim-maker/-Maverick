import { randomUUID } from "node:crypto";
import type { Db } from "./db/types";
import type { FieldCipher } from "./util/crypto";
import { audit } from "./audit";
import { updateSettings } from "./settings";
import { MEMORY_CATEGORIES, RETENTIONS } from "./memory";
import { HORIZONS } from "./planning";
import { UserFacingError } from "./util/errors";
import { LifeStore } from "./life";

/**
 * Restore a "maverick-export-v1" file (Settings → Export all data) into this
 * Maverick, e.g. when moving from the Mac to the cloud. Everything is re-encrypted
 * with this server's key. Only allowed into an account that has no data yet, so
 * nothing gets duplicated.
 */
export async function importAll(db: Db, cipher: FieldCipher, userId: string, data: unknown): Promise<Record<string, number>> {
  const d = data as Record<string, unknown>;
  if (!d || d.format !== "maverick-export-v1") throw new UserFacingError("That isn't a Maverick export file.", "bad_import");
  const counts = await db.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM memories WHERE user_id = $1) + (SELECT count(*) FROM goals WHERE user_id = $1)
          + (SELECT count(*) FROM tasks WHERE user_id = $1) + (SELECT count(*) FROM conversations WHERE user_id = $1) AS n`,
    [userId],
  );
  if (Number(counts.rows[0]?.n ?? 0) > 0) {
    throw new UserFacingError("Import only works into a fresh Maverick (no memories, goals, tasks or conversations yet).", "not_empty", 409);
  }

  const arr = (k: string) => (Array.isArray(d[k]) ? (d[k] as Record<string, unknown>[]) : []);
  const str = (v: unknown, max = 100_000) => (typeof v === "string" ? v.slice(0, max) : null);
  const date = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : new Date().toISOString());
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const enc = (v: string | null) => (v === null ? null : cipher.encrypt(v));
  const result = { memories: 0, goals: 0, tasks: 0, conversations: 0, messages: 0 };
  const goalIds = new Map<string, string>();

  await db.transaction(async (tx) => {
    for (const m of arr("memories")) {
      const content = str(m.content, 2000);
      if (!content || !MEMORY_CATEGORIES.includes(m.category as never)) continue;
      const retention = RETENTIONS.includes(m.retention as never) ? (m.retention as string) : "permanent";
      const source = ["user", "conversation", "briefing", "import"].includes(String(m.source)) ? String(m.source) : "import";
      await tx.query(
        `INSERT INTO memories (id, user_id, category, content_enc, source, confidence, retention, expires_at, pinned, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
        [
          randomUUID(),
          userId,
          m.category,
          cipher.encrypt(content),
          source,
          typeof m.confidence === "number" ? Math.min(1, Math.max(0, m.confidence)) : 1,
          retention,
          typeof m.expiresAt === "string" ? date(m.expiresAt) : null,
          m.pinned === true,
          date(m.createdAt),
        ],
      );
      result.memories++;
    }

    for (const g of arr("goals")) {
      const title = str(g.title, 200);
      if (!title) continue;
      const id = randomUUID();
      goalIds.set(String(g.id), id);
      await tx.query(
        "INSERT INTO goals (id, user_id, title_enc, detail_enc, metric_enc, horizon, target_date, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          userId,
          cipher.encrypt(title),
          enc(str(g.detail, 2000)),
          enc(str(g.metric, 300)),
          HORIZONS.includes(g.horizon as never) ? g.horizon : "other",
          day(g.targetDate),
          ["active", "done", "paused", "dropped"].includes(String(g.status)) ? g.status : "active",
          date(g.createdAt),
        ],
      );
      result.goals++;
    }

    for (const t of arr("tasks")) {
      const title = str(t.title, 300);
      if (!title) continue;
      const status = ["open", "done", "dropped"].includes(String(t.status)) ? String(t.status) : "open";
      await tx.query(
        `INSERT INTO tasks (id, user_id, goal_id, title_enc, notes_enc, priority, due_date, remind_at, reminded_at, status, source, created_at, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          randomUUID(),
          userId,
          goalIds.get(String(t.goalId)) ?? null,
          cipher.encrypt(title),
          enc(str(t.notes, 2000)),
          [1, 2, 3].includes(Number(t.priority)) ? Number(t.priority) : 2,
          day(t.dueDate),
          typeof t.remindAt === "string" ? date(t.remindAt) : null,
          // Don't re-send reminders that already went out on the old install.
          typeof t.remindAt === "string" && Date.parse(t.remindAt) < Date.now() ? new Date().toISOString() : null,
          status,
          t.source === "suggestion" ? "suggestion" : "user",
          date(t.createdAt),
          status === "done" ? date(t.completedAt) : null,
        ],
      );
      result.tasks++;
    }

    for (const c of arr("conversations")) {
      const id = randomUUID();
      await tx.query("INSERT INTO conversations (id, user_id, title_enc, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)", [
        id,
        userId,
        cipher.encrypt(str(c.title, 120) ?? "Imported conversation"),
        date(c.createdAt),
        date(c.updatedAt),
      ]);
      result.conversations++;
      for (const m of Array.isArray(c.messages) ? (c.messages as Record<string, unknown>[]) : []) {
        if (m.role !== "user" && m.role !== "assistant") continue;
        await tx.query(
          `INSERT INTO messages (id, conversation_id, role, content_enc, status, provider, model, tier, route_reason, input_tokens, output_tokens, cost_usd, latency_ms, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            randomUUID(),
            id,
            m.role,
            cipher.encrypt(str(m.content) ?? ""),
            ["complete", "partial", "error"].includes(String(m.status)) ? m.status : "complete",
            null,
            str(m.model, 100),
            str(m.tier, 20),
            str(m.routeReason, 200),
            typeof m.inputTokens === "number" ? m.inputTokens : null,
            typeof m.outputTokens === "number" ? m.outputTokens : null,
            typeof m.costUsd === "number" ? m.costUsd : null,
            typeof m.latencyMs === "number" ? m.latencyMs : null,
            date(m.createdAt),
          ],
        );
        result.messages++;
      }
    }

    // Spend history, so this month's budget meter stays accurate after the move.
    for (const u of arr("usage")) {
      if (typeof u.model !== "string") continue;
      await tx.query(
        `INSERT INTO usage_events (id, user_id, provider, model, input_tokens, output_tokens, cost_usd, estimated, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [randomUUID(), userId, str(u.provider, 40) ?? "import", u.model, Number(u.input_tokens) || 0, Number(u.output_tokens) || 0, Number(u.cost_usd) || 0, u.estimated === true, date(u.created_at)],
      );
    }
  });

  // Life (habits, logs, journal), present in exports made after the Life dashboard was added.
  let life: { habits: number; habitLogs: number; journal: number } | null = null;
  if (d.life && typeof d.life === "object") {
    const r = await new LifeStore(db, cipher).importAll(userId, d, { goalIds });
    life = { habits: r.habits, habitLogs: r.logs, journal: r.journal };
  }

  if (d.settings && typeof d.settings === "object") {
    try {
      await updateSettings(db, cipher, userId, d.settings);
    } catch {
      // Invalid settings in an old export shouldn't block the rest of the import.
    }
  }
  const out: Record<string, number> = { ...result, ...(life ?? {}) };
  await audit(db, { userId, actor: "user", action: "data.imported", details: out });
  return out;
}
