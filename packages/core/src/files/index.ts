import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Db } from "../db/types";
import type { FieldCipher } from "../util/crypto";
import { sha256 } from "../util/crypto";
import { audit } from "../audit";
import { estimateTokens } from "../llm/catalog";
import { UserFacingError } from "../util/errors";

/**
 * Files Oliver gives Maverick: PDFs, images, Word documents and text files.
 * The type is decided from the file's contents (magic bytes), never trusted
 * from its name or the browser. Everything is stored encrypted.
 */

export type FileKind = "pdf" | "image" | "text" | "docx";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Claude accepts at most 5 MB per image. (The browser shrinks big photos before upload.) */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_PAGES = 100;
/** Extracted text is cut here so one file can't blow the budget. */
export const MAX_TEXT_CHARS = 200_000;
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 5;
/** Approximate tokens per PDF page (text plus the page image Claude also sees). */
export const TOKENS_PER_PDF_PAGE = 2000;
/** Upper bound per image after Claude's automatic resizing. */
export const TOKENS_PER_IMAGE = 1600;

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".log", ".yaml", ".yml"]);

export interface StoredFile {
  id: string;
  name: string;
  kind: FileKind;
  mediaType: string;
  sizeBytes: number;
  pages: number | null;
  tokenEstimate: number;
  createdAt: string;
}

/** What gets sent to the model for a file. */
export interface ModelDocument {
  id: string;
  name: string;
  kind: "pdf" | "image" | "text";
  mediaType: string;
  /** base64 for pdf/image; plain text for text */
  data: string;
}

type Row = {
  id: string;
  name_enc: string;
  kind: FileKind;
  media_type: string;
  size_bytes: number;
  pages: number | null;
  token_estimate: number;
  created_at: Date | string;
};

const startsWith = (b: Buffer, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (b: Buffer, at: number, s: string) => b.subarray(at, at + s.length).toString("latin1") === s;

/** Identify a file from its first bytes. Returns null for anything Maverick doesn't accept. */
export function sniff(bytes: Buffer, filename: string): { kind: FileKind; mediaType: string } | { error: string } {
  const ext = path.extname(filename).toLowerCase();
  if (ascii(bytes, 0, "%PDF-")) return { kind: "pdf", mediaType: "application/pdf" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mediaType: "image/png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mediaType: "image/jpeg" };
  if (ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a")) return { kind: "image", mediaType: "image/gif" };
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return { kind: "image", mediaType: "image/webp" };
  if (ascii(bytes, 4, "ftyp") && /^(heic|heix|hevc|mif1|msf1)$/.test(bytes.subarray(8, 12).toString("latin1"))) {
    return { error: "HEIC photos aren't supported. On iPhone, choose the photo from the Photos picker (it converts to JPEG) or export it as JPEG." };
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === ".docx") return { kind: "docx", mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    return { error: "Only Word (.docx) documents are supported among zipped formats. For spreadsheets, export as CSV." };
  }
  if (TEXT_EXTENSIONS.has(ext) && looksLikeUtf8Text(bytes)) return { kind: "text", mediaType: "text/plain" };
  return { error: "Unsupported file type. Maverick reads PDFs, images (JPEG, PNG, GIF, WebP), Word (.docx) and text files (.txt, .md, .csv, .json)." };
}

function looksLikeUtf8Text(bytes: Buffer): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Rough page count from the PDF's page objects. Good enough for cost estimates and limits. */
export function countPdfPages(bytes: Buffer): number {
  const text = bytes.toString("latin1");
  const n = text.match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
  return Math.max(1, n);
}

export function cleanFilename(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_").trim();
  return (base || "file").slice(0, 160);
}

export class FileStore {
  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
  ) {}

  private toFile(r: Row): StoredFile {
    return {
      id: r.id,
      name: this.cipher.decrypt(r.name_enc),
      kind: r.kind,
      mediaType: r.media_type,
      sizeBytes: Number(r.size_bytes),
      pages: r.pages === null ? null : Number(r.pages),
      tokenEstimate: Number(r.token_estimate),
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async totalBytes(userId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number | string | null }>("SELECT COALESCE(SUM(size_bytes),0) AS n FROM files WHERE user_id = $1", [userId]);
    return Number(rows[0]?.n ?? 0);
  }

  /** Validate, extract and store a file. Throws a clear message for anything unacceptable. */
  async upload(userId: string, input: { name: string; bytes: Buffer }): Promise<StoredFile> {
    const name = cleanFilename(input.name);
    const bytes = input.bytes;
    if (!bytes.length) throw new UserFacingError("That file is empty.", "bad_file");
    if (bytes.length > MAX_FILE_BYTES) throw new UserFacingError(`"${name}" is larger than 10 MB.`, "file_too_large", 413);
    if ((await this.totalBytes(userId)) + bytes.length > MAX_TOTAL_BYTES) {
      throw new UserFacingError("Your file storage is full (300 MB). Delete some files in Files first.", "storage_full", 413);
    }
    const type = sniff(bytes, name);
    if ("error" in type) throw new UserFacingError(type.error, "unsupported_file", 415);

    let pages: number | null = null;
    let text: string | null = null;
    let tokens: number;
    if (type.kind === "pdf") {
      pages = countPdfPages(bytes);
      if (pages > MAX_PDF_PAGES) throw new UserFacingError(`"${name}" has about ${pages} pages; the limit is ${MAX_PDF_PAGES}. Split it into parts.`, "too_many_pages", 413);
      tokens = pages * TOKENS_PER_PDF_PAGE;
    } else if (type.kind === "image") {
      if (bytes.length > MAX_IMAGE_BYTES) throw new UserFacingError(`"${name}" is over 5 MB. Images must be smaller.`, "file_too_large", 413);
      tokens = TOKENS_PER_IMAGE;
    } else if (type.kind === "docx") {
      const mammoth = (await import("mammoth")).default;
      try {
        text = (await mammoth.extractRawText({ buffer: bytes })).value;
      } catch {
        throw new UserFacingError(`Couldn't read "${name}" as a Word document.`, "bad_file");
      }
      text = text.slice(0, MAX_TEXT_CHARS);
      if (!text.trim()) throw new UserFacingError(`"${name}" contains no readable text.`, "bad_file");
      tokens = estimateTokens(text);
    } else {
      text = bytes.toString("utf8").replace(/^﻿/, "").slice(0, MAX_TEXT_CHARS);
      tokens = estimateTokens(text);
    }

    const id = randomUUID();
    await this.db.query(
      `INSERT INTO files (id, user_id, name_enc, kind, media_type, size_bytes, sha256, pages, token_estimate, content_enc, text_enc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, userId, this.cipher.encrypt(name), type.kind, type.mediaType, bytes.length, sha256(bytes.toString("base64")), pages, tokens, this.cipher.encryptBytes(bytes), text === null ? null : this.cipher.encrypt(text)],
    );
    await audit(this.db, { userId, actor: "user", action: "file.uploaded", target: id, details: { kind: type.kind, sizeBytes: bytes.length } });
    return (await this.get(userId, id))!;
  }

  async get(userId: string, id: string): Promise<StoredFile | null> {
    const { rows } = await this.db.query<Row>(
      "SELECT id, name_enc, kind, media_type, size_bytes, pages, token_estimate, created_at FROM files WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    return rows[0] ? this.toFile(rows[0]) : null;
  }

  async list(userId: string): Promise<(StoredFile & { conversations: number })[]> {
    const { rows } = await this.db.query<Row & { conversations: number | string }>(
      `SELECT f.id, f.name_enc, f.kind, f.media_type, f.size_bytes, f.pages, f.token_estimate, f.created_at,
              (SELECT count(DISTINCT m.conversation_id) FROM message_files mf JOIN messages m ON m.id = mf.message_id WHERE mf.file_id = f.id) AS conversations
       FROM files f WHERE f.user_id = $1 ORDER BY f.created_at DESC`,
      [userId],
    );
    return rows.map((r) => ({ ...this.toFile(r), conversations: Number(r.conversations) }));
  }

  /** Original bytes, decrypted (for download / preview). */
  async content(userId: string, id: string): Promise<{ file: StoredFile; bytes: Buffer } | null> {
    const file = await this.get(userId, id);
    if (!file) return null;
    const { rows } = await this.db.query<{ content_enc: Uint8Array }>("SELECT content_enc FROM files WHERE id = $1", [id]);
    return { file, bytes: this.cipher.decryptBytes(Buffer.from(rows[0]!.content_enc)) };
  }

  async delete(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query("DELETE FROM files WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    if (!rows.length) throw new UserFacingError("File not found.", "not_found", 404);
    await audit(this.db, { userId, actor: "user", action: "file.deleted", target: id });
  }

  /** Check every id belongs to Oliver before attaching anything. */
  async assertOwned(userId: string, ids: string[]): Promise<StoredFile[]> {
    const unique = [...new Set(ids)];
    if (unique.length > MAX_FILES_PER_MESSAGE) throw new UserFacingError(`Attach at most ${MAX_FILES_PER_MESSAGE} files per message.`, "too_many_files");
    const files: StoredFile[] = [];
    for (const id of unique) {
      const f = typeof id === "string" ? await this.get(userId, id) : null;
      if (!f) throw new UserFacingError("One of the attached files no longer exists.", "not_found", 404);
      files.push(f);
    }
    return files;
  }

  async attach(messageId: string, fileIds: string[]): Promise<void> {
    for (const id of fileIds) {
      await this.db.query("INSERT INTO message_files (message_id, file_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [messageId, id]);
    }
  }

  /** Files attached to each message of a conversation (for showing chips). */
  async byMessage(userId: string, conversationId: string): Promise<Map<string, StoredFile[]>> {
    const { rows } = await this.db.query<Row & { message_id: string }>(
      `SELECT mf.message_id, f.id, f.name_enc, f.kind, f.media_type, f.size_bytes, f.pages, f.token_estimate, f.created_at
       FROM message_files mf JOIN messages m ON m.id = mf.message_id JOIN files f ON f.id = mf.file_id
       WHERE m.conversation_id = $1 AND f.user_id = $2 ORDER BY m.created_at, f.created_at`,
      [conversationId, userId],
    );
    const out = new Map<string, StoredFile[]>();
    for (const r of rows) out.set(r.message_id, [...(out.get(r.message_id) ?? []), this.toFile(r)]);
    return out;
  }

  /**
   * The documents "on the table" for a reply: every file attached so far in the
   * conversation plus any being attached now, oldest first. If they don't all fit
   * the token budget, the newest are kept.
   */
  async documentsFor(
    userId: string,
    conversationId: string | undefined,
    newFiles: StoredFile[],
    tokenBudget: number,
  ): Promise<{ docs: ModelDocument[]; files: StoredFile[]; dropped: StoredFile[]; tokens: number }> {
    let existing: StoredFile[] = [];
    if (conversationId) {
      const { rows } = await this.db.query<Row & { first_at: Date | string }>(
        `SELECT f.id, f.name_enc, f.kind, f.media_type, f.size_bytes, f.pages, f.token_estimate, f.created_at, min(m.created_at) AS first_at
         FROM message_files mf JOIN messages m ON m.id = mf.message_id JOIN files f ON f.id = mf.file_id
         WHERE m.conversation_id = $1 AND f.user_id = $2
         GROUP BY f.id, f.name_enc, f.kind, f.media_type, f.size_bytes, f.pages, f.token_estimate, f.created_at ORDER BY first_at ASC`,
        [conversationId, userId],
      );
      existing = rows.map((r) => this.toFile(r));
    }
    const seen = new Set(existing.map((f) => f.id));
    const all = [...existing, ...newFiles.filter((f) => !seen.has(f.id))];
    const kept: StoredFile[] = [];
    let used = 0;
    for (const f of [...all].reverse()) {
      if (used + f.tokenEstimate > tokenBudget) continue;
      kept.unshift(f);
      used += f.tokenEstimate;
    }
    const keptIds = new Set(kept.map((f) => f.id));
    const docs: ModelDocument[] = [];
    for (const f of kept) docs.push(await this.toModelDocument(f));
    return { docs, files: kept, dropped: all.filter((f) => !keptIds.has(f.id)), tokens: used };
  }

  private async toModelDocument(f: StoredFile): Promise<ModelDocument> {
    if (f.kind === "text" || f.kind === "docx") {
      const { rows } = await this.db.query<{ text_enc: string }>("SELECT text_enc FROM files WHERE id = $1", [f.id]);
      return { id: f.id, name: f.name, kind: "text", mediaType: "text/plain", data: this.cipher.decrypt(rows[0]!.text_enc) };
    }
    const { rows } = await this.db.query<{ content_enc: Uint8Array }>("SELECT content_enc FROM files WHERE id = $1", [f.id]);
    return { id: f.id, name: f.name, kind: f.kind, mediaType: f.mediaType, data: this.cipher.decryptBytes(Buffer.from(rows[0]!.content_enc)).toString("base64") };
  }
}
