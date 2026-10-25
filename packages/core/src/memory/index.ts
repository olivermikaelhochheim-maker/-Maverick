import { randomUUID } from "node:crypto";
import type { Db } from "../db/types";
import type { FieldCipher } from "../util/crypto";
import { audit } from "../audit";
import { estimateTokens } from "../llm/catalog";
import { UserFacingError } from "../util/errors";

export const MEMORY_CATEGORIES = ["profile", "preference", "goal", "project", "decision", "episodic", "ephemeral"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
export const RETENTIONS = ["permanent", "1y", "90d", "30d", "7d"] as const;
export type Retention = (typeof RETENTIONS)[number];
export type MemorySource = "user" | "conversation" | "briefing" | "import";

export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  profile: "Profile facts",
  preference: "Preferences",
  goal: "Goals",
  project: "Projects",
  decision: "Decisions",
  episodic: "Past events",
  ephemeral: "Short-term context",
};

/** Default retention: short-term context fades, everything else stays until Oliver deletes it. */
export const DEFAULT_RETENTION: Record<MemoryCategory, Retention> = {
  profile: "permanent",
  preference: "permanent",
  goal: "permanent",
  project: "1y",
  decision: "permanent",
  episodic: "1y",
  ephemeral: "7d",
};

const RETENTION_DAYS: Record<Retention, number | null> = { permanent: null, "1y": 365, "90d": 90, "30d": 30, "7d": 7 };

/** Most lines accepted in one paste. */
export const MAX_BULK = 100;

/** Split pasted text into memory lines, dropping bullets, numbering, blanks, headings and code fences. */
export function parseMemoryLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("```") && !/^#{1,6}\s/.test(l))
    .map((l) => l.replace(/^(?:[-*•–]\s+|\d{1,3}[.)]\s+)/, "").trim())
    .map((l) => l.replace(/^["“](.*)["”]$/, "$1").trim())
    .filter(Boolean);
}

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "").trim();

/** Categories that describe who Oliver is: always given to the model. */
const ALWAYS_INCLUDE: MemoryCategory[] = ["profile", "preference", "goal"];

export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  sourceRef: string | null;
  confidence: number;
  retention: Retention;
  expiresAt: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

type Row = {
  id: string;
  category: MemoryCategory;
  content_enc: string;
  source: MemorySource;
  source_ref: string | null;
  confidence: number;
  retention: Retention;
  expires_at: Date | string | null;
  pinned: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  last_used_at: Date | string | null;
};

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

function expiry(retention: Retention, from = new Date()): string | null {
  const days = RETENTION_DAYS[retention];
  return days === null ? null : new Date(from.getTime() + days * 86_400_000).toISOString();
}

function validate(input: { category?: string; content?: string; retention?: string; confidence?: number }) {
  if (input.category !== undefined && !MEMORY_CATEGORIES.includes(input.category as MemoryCategory)) {
    throw new UserFacingError("Unknown memory category.", "bad_memory");
  }
  if (input.content !== undefined) {
    const c = input.content.trim();
    if (!c) throw new UserFacingError("A memory can't be empty.", "bad_memory");
    if (c.length > 2000) throw new UserFacingError("Keep a memory under 2,000 characters.", "bad_memory");
  }
  if (input.retention !== undefined && !RETENTIONS.includes(input.retention as Retention)) {
    throw new UserFacingError("Unknown retention period.", "bad_memory");
  }
  if (input.confidence !== undefined && !(input.confidence >= 0 && input.confidence <= 1)) {
    throw new UserFacingError("Confidence must be between 0 and 1.", "bad_memory");
  }
}

export interface SelectedMemory {
  memory: Memory;
  reason: string;
}

export class MemoryStore {
  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
  ) {}

  private toMemory(r: Row): Memory {
    return {
      id: r.id,
      category: r.category,
      content: this.cipher.decrypt(r.content_enc),
      source: r.source,
      sourceRef: r.source_ref,
      confidence: Number(r.confidence),
      retention: r.retention,
      expiresAt: iso(r.expires_at),
      pinned: r.pinned,
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
      lastUsedAt: iso(r.last_used_at),
    };
  }

  async create(
    userId: string,
    input: { category: MemoryCategory; content: string; source: MemorySource; sourceRef?: string; confidence?: number; retention?: Retention; pinned?: boolean },
  ): Promise<Memory> {
    validate(input);
    const retention = input.retention ?? DEFAULT_RETENTION[input.category];
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO memories (id, user_id, category, content_enc, source, source_ref, confidence, retention, expires_at, pinned)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        userId,
        input.category,
        this.cipher.encrypt(input.content.trim()),
        input.source,
        input.sourceRef ?? null,
        input.confidence ?? 1,
        retention,
        expiry(retention),
        input.pinned ?? false,
      ],
    );
    await audit(this.db, { userId, actor: input.source === "user" ? "user" : "system", action: "memory.created", target: id, details: { category: input.category, source: input.source } });
    return (await this.get(userId, id))!;
  }

  /**
   * Add many memories at once from pasted text: one memory per line.
   * Bullets and numbering are stripped; blank lines, code-fence lines and
   * headings are ignored; duplicates (of each other or of existing memories) are skipped.
   * All-or-nothing: if any line is invalid, nothing is saved.
   */
  async createMany(
    userId: string,
    input: { category: MemoryCategory; text: string; retention?: Retention },
  ): Promise<{ added: Memory[]; skipped: { line: string; reason: string }[] }> {
    validate({ category: input.category, retention: input.retention });
    const lines = parseMemoryLines(input.text);
    if (!lines.length) throw new UserFacingError("Nothing to add: paste one memory per line.", "bad_memory");
    if (lines.length > MAX_BULK) throw new UserFacingError(`Paste at most ${MAX_BULK} lines at a time.`, "bad_memory");
    for (const [i, line] of lines.entries()) {
      if (line.length > 2000) throw new UserFacingError(`Line ${i + 1} is too long (max 2,000 characters).`, "bad_memory");
    }

    const seen = new Set((await this.list(userId)).map((m) => normalise(m.content)));
    const skipped: { line: string; reason: string }[] = [];
    const toAdd: string[] = [];
    for (const line of lines) {
      const key = normalise(line);
      if (seen.has(key)) {
        skipped.push({ line, reason: "Already in the vault" });
        continue;
      }
      seen.add(key);
      toAdd.push(line);
    }

    const retention = input.retention ?? DEFAULT_RETENTION[input.category];
    const ids = await this.db.transaction(async (tx) => {
      const out: string[] = [];
      for (const content of toAdd) {
        const id = randomUUID();
        await tx.query(
          `INSERT INTO memories (id, user_id, category, content_enc, source, confidence, retention, expires_at, created_at)
           VALUES ($1,$2,$3,$4,'user',1,$5,$6, clock_timestamp())`,
          [id, userId, input.category, this.cipher.encrypt(content), retention, expiry(retention)],
        );
        out.push(id);
      }
      if (out.length) {
        await audit(tx, { userId, actor: "user", action: "memory.bulk_created", details: { category: input.category, count: out.length } });
      }
      return out;
    });
    const added: Memory[] = [];
    for (const id of ids) added.push((await this.get(userId, id))!);
    return { added, skipped };
  }

  async get(userId: string, id: string): Promise<Memory | null> {
    const { rows } = await this.db.query<Row>("SELECT * FROM memories WHERE id = $1 AND user_id = $2", [id, userId]);
    return rows[0] ? this.toMemory(rows[0]) : null;
  }

  async list(userId: string): Promise<Memory[]> {
    const { rows } = await this.db.query<Row>(
      "SELECT * FROM memories WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now()) ORDER BY pinned DESC, updated_at DESC",
      [userId],
    );
    return rows.map((r) => this.toMemory(r));
  }

  async update(
    userId: string,
    id: string,
    patch: { content?: string; category?: MemoryCategory; retention?: Retention; pinned?: boolean; confidence?: number },
  ): Promise<Memory> {
    validate(patch);
    const current = await this.get(userId, id);
    if (!current) throw new UserFacingError("Memory not found.", "not_found", 404);
    const retention = patch.retention ?? current.retention;
    await this.db.query(
      `UPDATE memories SET content_enc = $1, category = $2, retention = $3, expires_at = $4, pinned = $5,
         confidence = $6, updated_at = now() WHERE id = $7 AND user_id = $8`,
      [
        this.cipher.encrypt((patch.content ?? current.content).trim()),
        patch.category ?? current.category,
        retention,
        patch.retention ? expiry(retention) : current.expiresAt,
        patch.pinned ?? current.pinned,
        // Oliver editing the text makes it his own statement.
        patch.content !== undefined ? 1 : (patch.confidence ?? current.confidence),
        id,
        userId,
      ],
    );
    await audit(this.db, { userId, actor: "user", action: "memory.updated", target: id, details: { fields: Object.keys(patch) } });
    return (await this.get(userId, id))!;
  }

  async delete(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query("DELETE FROM memories WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    if (!rows.length) throw new UserFacingError("Memory not found.", "not_found", 404);
    await audit(this.db, { userId, actor: "user", action: "memory.deleted", target: id });
  }

  /** Delete memories whose retention period has passed. Returns how many were removed. */
  async purgeExpired(): Promise<number> {
    const { rows } = await this.db.query<{ user_id: string }>(
      "DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at <= now() RETURNING user_id",
    );
    if (rows.length) {
      await audit(this.db, { userId: rows[0]!.user_id, actor: "system", action: "memory.expired", details: { count: rows.length } });
    }
    return rows.length;
  }

  /**
   * Choose which memories to give the model for this message, with a reason for each.
   * Who Oliver is (profile, preferences, goals) and pinned items always go in;
   * other memories go in when they share meaningful words with the message.
   * Capped at `tokenBudget` so memory can't silently inflate cost.
   */
  async selectForPrompt(userId: string, text: string, tokenBudget = 1500): Promise<SelectedMemory[]> {
    const all = await this.list(userId);
    const words = keywordMap(text);
    const scored = all.map((m) => {
      if (m.pinned) return { memory: m, score: 100, reason: "Pinned" };
      if (ALWAYS_INCLUDE.includes(m.category)) return { memory: m, score: 50, reason: `Always included: ${CATEGORY_LABELS[m.category].toLowerCase()}` };
      // Show Oliver's own words in the reason, not the internal stems.
      const overlap = [...keywords(m.content)].filter((w) => words.has(w)).map((w) => words.get(w)!);
      if (overlap.length === 0) return { memory: m, score: 0, reason: "" };
      return { memory: m, score: overlap.length * 10, reason: `Matches: ${overlap.slice(0, 4).join(", ")}` };
    });
    const chosen: SelectedMemory[] = [];
    let used = 0;
    for (const s of scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score)) {
      const cost = estimateTokens(s.memory.content) + 8;
      if (used + cost > tokenBudget) continue;
      used += cost;
      chosen.push({ memory: s.memory, reason: s.reason });
    }
    return chosen;
  }

  async markUsed(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.db.query("UPDATE memories SET last_used_at = now() WHERE id = ANY($1::text[])", [ids]);
  }

  async recordContext(messageId: string, selected: SelectedMemory[]): Promise<void> {
    for (const s of selected) {
      await this.db.query("INSERT INTO message_context (message_id, memory_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [
        messageId,
        s.memory.id,
        s.reason,
      ]);
    }
  }

  /** Why each memory was used for a given reply (for the "context used" panel). */
  async contextFor(userId: string, messageId: string): Promise<{ id: string; category: MemoryCategory; content: string; reason: string }[]> {
    const { rows } = await this.db.query<Row & { reason: string }>(
      `SELECT m.*, c.reason FROM message_context c JOIN memories m ON m.id = c.memory_id
       WHERE c.message_id = $1 AND m.user_id = $2`,
      [messageId, userId],
    );
    return rows.map((r) => ({ id: r.id, category: r.category, content: this.cipher.decrypt(r.content_enc), reason: r.reason }));
  }
}

const STOP = new Set(
  "the and for that this with you your are was have has had not but what when where which who how why can could would should will just about into from they them then than there their our out get got make made very also some more most much many any all its it's i'm i've don't me my mine we us of to in on at by an a is be or as if so do it".split(" "),
);

const stem = (w: string) => (w.length > 5 ? w.replace(/(ing|ed|es|s)$/, "") : w);

/** Meaningful words as stems -> the original word (so "billing" and "bill" match). */
export function keywordMap(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const w of text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)) {
    if (w.length >= 4 && !STOP.has(w) && !out.has(stem(w))) out.set(stem(w), w);
  }
  return out;
}

export function keywords(text: string): Set<string> {
  return new Set(keywordMap(text).keys());
}

/** Render selected memories for the model, labelled by category and source. */
export function renderMemories(selected: SelectedMemory[], name = "Oliver"): string {
  if (!selected.length) return "";
  const lines = selected.map((s) => {
    const m = s.memory;
    const origin = m.source === "user" ? `stated by ${name}` : `inferred from ${m.source}, confidence ${m.confidence.toFixed(1)}`;
    return `- [${m.category}] ${m.content} (${origin}; saved ${m.createdAt.slice(0, 10)})`;
  });
  return `Memories ${name} has approved (may be out of date; inferred items are less certain):\n${lines.join("\n")}`;
}
