import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FileStore, cleanFilename, countPdfPages, sniff } from "../src/files";
import { ChatService, defaultDeps, type ChatStreamEvent } from "../src/chat/service";
import type { ChatRequest, LLMProvider } from "../src/llm/types";
import { collect, freshDb, liveProviders, seedUser, testCipher } from "./helpers";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (n: string) => readFileSync(path.join(here, "fixtures", n));

class SpyProvider implements LLMProvider {
  readonly id = "spy";
  requests: ChatRequest[] = [];
  isConfigured() {
    return true;
  }
  async *stream(req: ChatRequest) {
    this.requests.push(req);
    yield { type: "text" as const, text: "The notice period is three months." };
    yield { type: "done" as const, stopReason: "end_turn", servedBy: req.model, usage: { inputTokens: 5000, outputTokens: 20 } };
  }
}

async function world() {
  const db = await freshDb();
  const user = await seedUser(db);
  const cipher = testCipher();
  const files = new FileStore(db, cipher);
  return { db, user, cipher, files };
}

describe("file type detection (by content, not name)", () => {
  it("recognises supported formats", () => {
    expect(sniff(fixture("contract.pdf"), "x.bin")).toEqual({ kind: "pdf", mediaType: "application/pdf" });
    expect(sniff(fixture("pixel.png"), "photo.jpg")).toEqual({ kind: "image", mediaType: "image/png" });
    expect(sniff(fixture("plan.docx"), "plan.docx")).toMatchObject({ kind: "docx" });
    expect(sniff(Buffer.from("name,amount\nA,1\n"), "budget.csv")).toEqual({ kind: "text", mediaType: "text/plain" });
  });

  it("rejects disguised, binary and unsupported files", () => {
    expect(sniff(Buffer.from("MZ\x90\x00binary"), "notes.txt")).toHaveProperty("error");
    expect(sniff(Buffer.from("plain words"), "script.sh")).toHaveProperty("error");
    expect(sniff(fixture("plan.docx"), "sheet.xlsx")).toHaveProperty("error");
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(16)]);
    expect((sniff(heic, "IMG_1234.HEIC") as { error: string }).error).toMatch(/HEIC/);
  });

  it("counts PDF pages and cleans filenames", () => {
    expect(countPdfPages(fixture("contract.pdf"))).toBe(2);
    expect(cleanFilename("../../etc/passwd")).toBe("passwd");
    expect(cleanFilename('C:\\Users\\Oliver\\bad<name>.pdf')).toBe("bad_name_.pdf");
  });
});

describe("file store", () => {
  it("stores files encrypted, extracts Word text, and estimates cost", async () => {
    const { db, user, files } = await world();
    const pdf = await files.upload(user.id, { name: "contract.pdf", bytes: fixture("contract.pdf") });
    expect(pdf).toMatchObject({ kind: "pdf", pages: 2, tokenEstimate: 4000 });
    const docx = await files.upload(user.id, { name: "plan.docx", bytes: fixture("plan.docx") });
    expect(docx.kind).toBe("docx");
    const raw = await db.query<{ content_enc: Uint8Array; name_enc: string }>("SELECT content_enc, name_enc FROM files WHERE id = $1", [pdf.id]);
    expect(Buffer.from(raw.rows[0]!.content_enc).toString("latin1")).not.toContain("Notice period");
    expect(raw.rows[0]!.name_enc).not.toContain("contract");
    const back = await files.content(user.id, pdf.id);
    expect(back!.bytes.equals(fixture("contract.pdf"))).toBe(true);
    const view = await files.documentsFor(user.id, undefined, [docx], 100_000);
    expect(view.docs[0]).toMatchObject({ kind: "text", name: "plan.docx" });
    expect(view.docs[0]!.data).toContain("first paying client by March 2027");
  });

  it("enforces limits with clear messages", async () => {
    const { user, files } = await world();
    await expect(files.upload(user.id, { name: "empty.txt", bytes: Buffer.alloc(0) })).rejects.toThrow(/empty/);
    await expect(files.upload(user.id, { name: "big.txt", bytes: Buffer.alloc(11 * 1024 * 1024, 65) })).rejects.toThrow(/larger than 10 MB/);
    await expect(files.upload(user.id, { name: "app.exe", bytes: Buffer.from("MZ\x00\x00") })).rejects.toMatchObject({ code: "unsupported_file" });
    const manyPages = Buffer.from("%PDF-1.4\n" + "<< /Type /Page >>\n".repeat(150));
    await expect(files.upload(user.id, { name: "book.pdf", bytes: manyPages })).rejects.toThrow(/150 pages/);
  });

  it("keeps the newest files when a conversation's files exceed the budget", async () => {
    const { user, files } = await world();
    const a = await files.upload(user.id, { name: "a.txt", bytes: Buffer.from("a".repeat(7000)) }); // ~2000 tokens
    const b = await files.upload(user.id, { name: "b.txt", bytes: Buffer.from("b".repeat(7000)) });
    const view = await files.documentsFor(user.id, undefined, [a, b], 3000);
    expect(view.files.map((f) => f.name)).toEqual(["b.txt"]);
    expect(view.dropped.map((f) => f.name)).toEqual(["a.txt"]);
  });
});

describe("chatting with files", () => {
  it("sends attached files to the model, keeps them for follow-ups, and uses at least the standard model", async () => {
    const { db, user, cipher } = await world();
    const deps = defaultDeps(db, cipher);
    const spy = new SpyProvider();
    const chat = new ChatService(db, cipher, liveProviders(spy), deps);
    const pdf = await deps.files.upload(user.id, { name: "contract.pdf", bytes: fixture("contract.pdf") });

    const first = await collect(chat.send({ user, text: "What's my notice period?", fileIds: [pdf.id] }));
    const meta = first[0] as Extract<ChatStreamEvent, { type: "meta" }>;
    expect(meta.files).toEqual([{ id: pdf.id, name: "contract.pdf", kind: "pdf" }]);
    expect(meta.model).toBe("claude-sonnet-5-5");
    expect(meta.routeReason).toMatch(/Files/);
    expect(spy.requests[0]!.documents).toEqual([expect.objectContaining({ name: "contract.pdf", kind: "pdf", mediaType: "application/pdf" })]);
    expect(Buffer.from(spy.requests[0]!.documents![0]!.data, "base64").equals(fixture("contract.pdf"))).toBe(true);

    // Follow-up without re-attaching: the file is still in view.
    await collect(chat.send({ user, conversationId: meta.conversationId, text: "And what does it say about salary?" }));
    expect(spy.requests[1]!.documents?.map((d) => d.name)).toEqual(["contract.pdf"]);

    // Chips: the file belongs to the first user message.
    const byMsg = await deps.files.byMessage(user.id, meta.conversationId);
    expect([...byMsg.get(meta.userMessageId)!.map((f) => f.name)]).toEqual(["contract.pdf"]);
    expect((await deps.files.list(user.id))[0]!.conversations).toBe(1);
  });

  it("won't attach someone else's file or too many files", async () => {
    const { db, user, cipher } = await world();
    const deps = defaultDeps(db, cipher);
    const chat = new ChatService(db, cipher, liveProviders(new SpyProvider()), deps);
    await expect(collect(chat.send({ user, text: "hi", fileIds: ["not-mine"] }))).rejects.toMatchObject({ code: "not_found" });
    await expect(collect(chat.send({ user, text: "hi", fileIds: ["1", "2", "3", "4", "5", "6"] }))).rejects.toMatchObject({ code: "too_many_files" });
  });

  it("counts file tokens in the budget check before calling the model", async () => {
    const { db, user, cipher } = await world();
    const deps = defaultDeps(db, cipher);
    const spy = new SpyProvider();
    const chat = new ChatService(db, cipher, liveProviders(spy), deps);
    const { updateSettings } = await import("../src/settings");
    // $0.05 left today: a 4,000-token PDF on Sonnet still fits; 40 pages wouldn't.
    await updateSettings(db, cipher, user.id, { budget: { dailyHardUsd: 0.05 } });
    const big = Buffer.from("%PDF-1.4\n" + "<< /Type /Page >>\n".repeat(40));
    const f = await deps.files.upload(user.id, { name: "big.pdf", bytes: big });
    const events = await collect(chat.send({ user, text: "Summarise", fileIds: [f.id] }));
    expect(events[0]).toMatchObject({ type: "error", code: "budget_exceeded" });
    expect(spy.requests).toHaveLength(0);
  });

  it("deleting a file removes it from conversations", async () => {
    const { db, user, cipher } = await world();
    const deps = defaultDeps(db, cipher);
    const spy = new SpyProvider();
    const chat = new ChatService(db, cipher, liveProviders(spy), deps);
    const f = await deps.files.upload(user.id, { name: "plan.docx", bytes: fixture("plan.docx") });
    const ev = await collect(chat.send({ user, text: "Read this", fileIds: [f.id] }));
    await deps.files.delete(user.id, f.id);
    await collect(chat.send({ user, conversationId: (ev[0] as { conversationId: string }).conversationId, text: "again" }));
    expect(spy.requests[1]!.documents ?? []).toEqual([]);
  });
});
