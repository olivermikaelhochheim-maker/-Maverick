import { randomUUID } from "node:crypto";
import type { Db } from "../db/types";
import type { FieldCipher } from "../util/crypto";
import { audit } from "../audit";
import { UserFacingError } from "../util/errors";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "partial" | "error";
  model: string | null;
  tier: string | null;
  routeReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  createdAt: string;
}

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content_enc: string;
  status: StoredMessage["status"];
  model: string | null;
  tier: string | null;
  route_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  created_at: Date | string;
};

export class ConversationStore {
  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
  ) {}

  async create(userId: string, title: string): Promise<string> {
    const id = randomUUID();
    await this.db.query("INSERT INTO conversations (id, user_id, title_enc) VALUES ($1, $2, $3)", [
      id,
      userId,
      this.cipher.encrypt(title.slice(0, 120)),
    ]);
    return id;
  }

  async assertOwner(userId: string, conversationId: string): Promise<void> {
    const { rows } = await this.db.query("SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2", [
      conversationId,
      userId,
    ]);
    if (!rows.length) throw new UserFacingError("Conversation not found.", "not_found", 404);
  }

  async list(userId: string, limit = 50): Promise<ConversationSummary[]> {
    const { rows } = await this.db.query<{ id: string; title_enc: string; created_at: Date; updated_at: Date }>(
      "SELECT id, title_enc, created_at, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2",
      [userId, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      title: this.cipher.decrypt(r.title_enc),
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async rename(userId: string, conversationId: string, title: string): Promise<void> {
    await this.assertOwner(userId, conversationId);
    const clean = title.trim().slice(0, 120);
    if (!clean) throw new UserFacingError("Title can't be empty.", "bad_title");
    await this.db.query("UPDATE conversations SET title_enc = $1 WHERE id = $2", [this.cipher.encrypt(clean), conversationId]);
  }

  async delete(userId: string, conversationId: string): Promise<void> {
    await this.assertOwner(userId, conversationId);
    await this.db.query("DELETE FROM conversations WHERE id = $1", [conversationId]);
    await audit(this.db, { userId, actor: "user", action: "conversation.deleted", target: conversationId });
  }

  async messages(userId: string, conversationId: string, limit = 500): Promise<StoredMessage[]> {
    await this.assertOwner(userId, conversationId);
    const { rows } = await this.db.query<MessageRow>(
      `SELECT * FROM (SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2) t
       ORDER BY created_at ASC`,
      [conversationId, limit],
    );
    return rows.map((r) => this.toMessage(r));
  }

  async addMessage(
    conversationId: string,
    msg: {
      role: "user" | "assistant";
      content: string;
      status?: StoredMessage["status"];
      provider?: string;
      model?: string;
      tier?: string;
      routeReason?: string;
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
      latencyMs?: number;
    },
  ): Promise<string> {
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO messages (id, conversation_id, role, content_enc, status, provider, model, tier, route_reason,
                             input_tokens, output_tokens, cost_usd, latency_ms, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, clock_timestamp())`,
      [
        id,
        conversationId,
        msg.role,
        this.cipher.encrypt(msg.content),
        msg.status ?? "complete",
        msg.provider ?? null,
        msg.model ?? null,
        msg.tier ?? null,
        msg.routeReason ?? null,
        msg.inputTokens ?? null,
        msg.outputTokens ?? null,
        msg.costUsd ?? null,
        msg.latencyMs ?? null,
      ],
    );
    await this.db.query("UPDATE conversations SET updated_at = now() WHERE id = $1", [conversationId]);
    return id;
  }

  private toMessage(r: MessageRow): StoredMessage {
    return {
      id: r.id,
      role: r.role,
      content: this.cipher.decrypt(r.content_enc),
      status: r.status,
      model: r.model,
      tier: r.tier,
      routeReason: r.route_reason,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
      latencyMs: r.latency_ms,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }
}

/** Keep the most recent turns that fit the token budget, always starting on a user turn. */
export function windowHistory<T extends { role: string; content: string }>(
  turns: T[],
  tokenBudget: number,
  estimate: (s: string) => number,
): T[] {
  const kept: T[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    const cost = estimate(t.content);
    if (kept.length > 0 && used + cost > tokenBudget) break;
    kept.unshift(t);
    used += cost;
  }
  while (kept.length && kept[0]!.role !== "user") kept.shift();
  return kept;
}
