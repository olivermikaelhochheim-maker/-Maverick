import { randomUUID } from "node:crypto";
import type { Db } from "./db/types";
import type { FieldCipher } from "./util/crypto";
import { audit } from "./audit";
import { MEMORY_CATEGORIES, MemoryStore, type MemoryCategory } from "./memory";
import { HORIZONS, PlanningStore, type Horizon } from "./planning";
import { UserFacingError } from "./util/errors";

export type SuggestionKind = "memory" | "task" | "goal" | "action";
export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "expired";

export type SuggestionPayload =
  | { kind: "memory"; category: MemoryCategory; content: string; confidence: number }
  | { kind: "task"; title: string; notes: string | null; priority: 1 | 2 | 3; dueDate: string | null }
  | { kind: "goal"; title: string; horizon: Horizon; metric: string | null; targetDate: string | null }
  | { kind: "action"; title: string; why: string };

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  title: string;
  body: string | null;
  payload: SuggestionPayload;
  status: SuggestionStatus;
  source: "conversation" | "briefing";
  sourceRef: string | null;
  createdAt: string;
}

/** Most pending suggestions kept at once; the oldest expire first. */
export const MAX_PENDING = 30;
/** Pending suggestions older than this expire. */
export const SUGGESTION_TTL_DAYS = 14;

type Row = {
  id: string;
  kind: SuggestionKind;
  title_enc: string;
  body_enc: string | null;
  payload_enc: string;
  status: SuggestionStatus;
  source: "conversation" | "briefing";
  source_ref: string | null;
  created_at: Date | string;
};

/** Validate model-produced payloads: the model is not trusted to follow the schema. */
export function parsePayload(raw: unknown): SuggestionPayload {
  const bad = (msg: string): never => {
    throw new UserFacingError(msg, "bad_suggestion");
  };
  if (typeof raw !== "object" || raw === null) bad("Suggestion must be an object.");
  const r = raw as Record<string, unknown>;
  const str = (k: string, max: number, required = true): string | null => {
    const v = r[k];
    if (v === null || v === undefined || v === "") return required ? bad(`Missing ${k}.`) : null;
    if (typeof v !== "string") return bad(`${k} must be text.`);
    const t = v.trim();
    if (t.length > max) return bad(`${k} is too long.`);
    if (!t && required) return bad(`Missing ${k}.`);
    return t || null;
  };
  const dateOrNull = (k: string) => {
    const v = str(k, 10, false);
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) bad(`${k} must be YYYY-MM-DD.`);
    return v;
  };
  switch (r.kind) {
    case "memory": {
      const category = r.category as MemoryCategory;
      if (!MEMORY_CATEGORIES.includes(category)) bad("Unknown memory category.");
      const confidence = typeof r.confidence === "number" ? Math.min(1, Math.max(0, r.confidence)) : 0.7;
      return { kind: "memory", category, content: str("content", 1000)!, confidence };
    }
    case "task": {
      const priority = [1, 2, 3].includes(Number(r.priority)) ? (Number(r.priority) as 1 | 2 | 3) : 2;
      return { kind: "task", title: str("title", 300)!, notes: str("notes", 1000, false), priority, dueDate: dateOrNull("dueDate") };
    }
    case "goal": {
      const horizon = (HORIZONS as readonly string[]).includes(String(r.horizon)) ? (r.horizon as Horizon) : "other";
      return { kind: "goal", title: str("title", 200)!, horizon, metric: str("metric", 300, false), targetDate: dateOrNull("targetDate") };
    }
    case "action":
      return { kind: "action", title: str("title", 200)!, why: str("why", 600)! };
    default:
      return bad("Unknown suggestion kind.");
  }
}

function titleOf(p: SuggestionPayload): string {
  return p.kind === "memory" ? p.content : p.title;
}

export class SuggestionStore {
  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
    private readonly memories: MemoryStore,
    private readonly planning: PlanningStore,
  ) {}

  private toSuggestion(r: Row): Suggestion {
    return {
      id: r.id,
      kind: r.kind,
      title: this.cipher.decrypt(r.title_enc),
      body: r.body_enc ? this.cipher.decrypt(r.body_enc) : null,
      payload: JSON.parse(this.cipher.decrypt(r.payload_enc)) as SuggestionPayload,
      status: r.status,
      source: r.source,
      sourceRef: r.source_ref,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  /** Add a pending suggestion. Returns null for a duplicate of something already pending. */
  async propose(
    userId: string,
    payload: SuggestionPayload,
    opts: { reason?: string | null; source: "conversation" | "briefing"; sourceRef?: string },
  ): Promise<Suggestion | null> {
    const title = titleOf(payload);
    const pending = await this.list(userId, "pending");
    if (pending.some((s) => s.kind === payload.kind && s.title.toLowerCase() === title.toLowerCase())) return null;
    if (pending.length >= MAX_PENDING) {
      const oldest = pending[pending.length - 1]!;
      await this.db.query("UPDATE suggestions SET status = 'expired', decided_at = now() WHERE id = $1", [oldest.id]);
    }
    const id = randomUUID();
    const body = payload.kind === "action" ? payload.why : (opts.reason ?? null);
    await this.db.query(
      `INSERT INTO suggestions (id, user_id, kind, title_enc, body_enc, payload_enc, source, source_ref, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, clock_timestamp())`,
      [
        id,
        userId,
        payload.kind,
        this.cipher.encrypt(title),
        body ? this.cipher.encrypt(body) : null,
        this.cipher.encrypt(JSON.stringify(payload)),
        opts.source,
        opts.sourceRef ?? null,
      ],
    );
    await audit(this.db, { userId, actor: "assistant", action: "suggestion.proposed", target: id, details: { kind: payload.kind, source: opts.source } });
    return (await this.get(userId, id))!;
  }

  async get(userId: string, id: string): Promise<Suggestion | null> {
    const { rows } = await this.db.query<Row>("SELECT * FROM suggestions WHERE id = $1 AND user_id = $2", [id, userId]);
    return rows[0] ? this.toSuggestion(rows[0]) : null;
  }

  async list(userId: string, status: SuggestionStatus | "all" = "pending", limit = 100): Promise<Suggestion[]> {
    const { rows } = await this.db.query<Row>(
      `SELECT * FROM suggestions WHERE user_id = $1 ${status === "all" ? "" : "AND status = $3"} ORDER BY created_at DESC LIMIT $2`,
      status === "all" ? [userId, limit] : [userId, limit, status],
    );
    return rows.map((r) => this.toSuggestion(r));
  }

  /** Suggestions made in one conversation (any status), oldest first. */
  async forConversation(userId: string, conversationId: string): Promise<Suggestion[]> {
    const { rows } = await this.db.query<Row>(
      "SELECT * FROM suggestions WHERE user_id = $1 AND source_ref = $2 ORDER BY created_at ASC",
      [userId, conversationId],
    );
    return rows.map((r) => this.toSuggestion(r));
  }

  /**
   * Oliver accepts: the suggestion takes effect now.
   * memory -> Memory Vault (keeps the model's confidence and its source)
   * task / action -> task list; goal -> goals.
   * `edits` lets Oliver correct the text before accepting.
   */
  async accept(userId: string, id: string, edits: { title?: string } = {}): Promise<{ createdId: string; kind: SuggestionKind }> {
    const s = await this.get(userId, id);
    if (!s) throw new UserFacingError("Suggestion not found.", "not_found", 404);
    if (s.status !== "pending") throw new UserFacingError("This suggestion was already handled.", "not_pending", 409);
    const p = s.payload;
    const edited = edits.title?.trim();
    let createdId: string;
    if (p.kind === "memory") {
      createdId = (
        await this.memories.create(userId, {
          category: p.category,
          content: edited || p.content,
          source: s.source === "briefing" ? "briefing" : "conversation",
          sourceRef: s.sourceRef ?? undefined,
          // Oliver correcting the wording makes it his statement.
          confidence: edited ? 1 : p.confidence,
        })
      ).id;
    } else if (p.kind === "goal") {
      createdId = (await this.planning.createGoal(userId, { title: edited || p.title, horizon: p.horizon, metric: p.metric, targetDate: p.targetDate }, "system")).id;
    } else if (p.kind === "task") {
      createdId = (await this.planning.createTask(userId, { title: edited || p.title, notes: p.notes, priority: p.priority, dueDate: p.dueDate }, "suggestion")).id;
    } else {
      createdId = (await this.planning.createTask(userId, { title: edited || p.title, notes: p.why }, "suggestion")).id;
    }
    await this.db.query("UPDATE suggestions SET status = 'accepted', decided_at = now() WHERE id = $1", [id]);
    await audit(this.db, { userId, actor: "user", action: "suggestion.accepted", target: id, details: { kind: s.kind, createdId, edited: Boolean(edited) } });
    return { createdId, kind: s.kind };
  }

  async dismiss(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query(
      "UPDATE suggestions SET status = 'dismissed', decided_at = now() WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id",
      [id, userId],
    );
    if (!rows.length) throw new UserFacingError("Suggestion not found or already handled.", "not_found", 404);
    await audit(this.db, { userId, actor: "user", action: "suggestion.dismissed", target: id });
  }

  async expireOld(): Promise<number> {
    const { rows } = await this.db.query(
      `UPDATE suggestions SET status = 'expired', decided_at = now()
       WHERE status = 'pending' AND created_at < now() - ($1 || ' days')::interval RETURNING id`,
      [String(SUGGESTION_TTL_DAYS)],
    );
    return rows.length;
  }
}
