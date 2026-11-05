import { randomUUID } from "node:crypto";
import type { Db } from "./db/types";
import type { FieldCipher } from "./util/crypto";
import { audit } from "./audit";
import { UserFacingError } from "./util/errors";

/**
 * Email drafts. Maverick has no way to send email: a draft is handed to
 * Oliver's own mail app (mailto:), and Oliver presses Send there.
 */

export type DraftStatus = "draft" | "handed_off" | "discarded";

export interface Draft {
  id: string;
  missionId: string | null;
  to: string;
  subject: string;
  body: string;
  status: DraftStatus;
  writtenBy: "model" | "template" | "user";
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  mission_id: string | null;
  to_enc: string;
  subject_enc: string;
  body_enc: string;
  status: DraftStatus;
  written_by: Draft["writtenBy"];
  created_at: Date | string;
  updated_at: Date | string;
};

function field(v: unknown, label: string, max: number, required: boolean): string {
  if (typeof v !== "string") {
    if (!required && (v === undefined || v === null)) return "";
    throw new UserFacingError(`${label} must be text.`, "bad_input");
  }
  const t = v.trim();
  if (required && !t) throw new UserFacingError(`${label} is required.`, "bad_input");
  if (t.length > max) throw new UserFacingError(`${label} is too long (max ${max}).`, "bad_input");
  return t;
}

/** A plain recipient check; the address is only ever put in a mailto: link. */
export function validRecipients(to: string): boolean {
  if (!to) return true;
  return to.split(/[,;]\s*/).every((a) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(a.trim()));
}

export function mailtoLink(d: Pick<Draft, "to" | "subject" | "body">): string {
  const q = new URLSearchParams({ subject: d.subject, body: d.body }).toString().replace(/\+/g, "%20");
  return `mailto:${d.to.split(/[,;]\s*/).map(encodeURIComponent).join(",")}?${q}`;
}

export class DraftStore {
  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
  ) {}

  private toDraft(r: Row): Draft {
    return {
      id: r.id,
      missionId: r.mission_id,
      to: this.cipher.decrypt(r.to_enc),
      subject: this.cipher.decrypt(r.subject_enc),
      body: this.cipher.decrypt(r.body_enc),
      status: r.status,
      writtenBy: r.written_by,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  async create(userId: string, input: { to?: unknown; subject: unknown; body: unknown }, meta: { missionId?: string | null; writtenBy: Draft["writtenBy"] }): Promise<Draft> {
    const to = field(input.to, "Recipient", 500, false);
    if (!validRecipients(to)) throw new UserFacingError("Recipient must be an email address (or several, separated by commas).", "bad_input");
    const subject = field(input.subject, "Subject", 300, true);
    const body = field(input.body, "Body", 20_000, true);
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO drafts (id, user_id, mission_id, to_enc, subject_enc, body_enc, status, written_by) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7)",
      [id, userId, meta.missionId ?? null, this.cipher.encrypt(to), this.cipher.encrypt(subject), this.cipher.encrypt(body), meta.writtenBy],
    );
    await audit(this.db, { userId, actor: meta.writtenBy === "user" ? "user" : "system", action: "draft.created", target: id });
    return (await this.get(userId, id))!;
  }

  async get(userId: string, id: string): Promise<Draft | null> {
    const { rows } = await this.db.query<Row>("SELECT * FROM drafts WHERE id = $1 AND user_id = $2", [id, userId]);
    return rows[0] ? this.toDraft(rows[0]) : null;
  }

  async list(userId: string, includeDiscarded = false): Promise<Draft[]> {
    const { rows } = await this.db.query<Row>(
      `SELECT * FROM drafts WHERE user_id = $1 ${includeDiscarded ? "" : "AND status <> 'discarded'"} ORDER BY updated_at DESC LIMIT 200`,
      [userId],
    );
    return rows.map((r) => this.toDraft(r));
  }

  async update(userId: string, id: string, patch: { to?: unknown; subject?: unknown; body?: unknown; status?: unknown }): Promise<Draft> {
    const d = await this.get(userId, id);
    if (!d) throw new UserFacingError("Draft not found.", "not_found", 404);
    const to = patch.to !== undefined ? field(patch.to, "Recipient", 500, false) : d.to;
    if (!validRecipients(to)) throw new UserFacingError("Recipient must be an email address.", "bad_input");
    const status = (patch.status ?? d.status) as DraftStatus;
    if (!["draft", "handed_off", "discarded"].includes(status)) throw new UserFacingError("Unknown draft status.", "bad_input");
    await this.db.query("UPDATE drafts SET to_enc=$1, subject_enc=$2, body_enc=$3, status=$4, updated_at=now() WHERE id=$5 AND user_id=$6", [
      this.cipher.encrypt(to),
      this.cipher.encrypt(patch.subject !== undefined ? field(patch.subject, "Subject", 300, true) : d.subject),
      this.cipher.encrypt(patch.body !== undefined ? field(patch.body, "Body", 20_000, true) : d.body),
      status,
      id,
      userId,
    ]);
    if (status !== d.status) await audit(this.db, { userId, actor: "user", action: `draft.${status}`, target: id });
    return (await this.get(userId, id))!;
  }
}
