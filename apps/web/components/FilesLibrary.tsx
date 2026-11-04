"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { ACCEPT, KIND_ICON, formatBytes, formatTokens, prepareFile, uploadFile, type UploadedFile } from "@/lib/upload";

type Row = UploadedFile & { conversations: number };

const KIND_LABEL: Record<UploadedFile["kind"], string> = { pdf: "PDF", image: "Image", text: "Text", docx: "Word" };

export function FilesLibrary({ initial, totalBytes }: { initial: Row[]; totalBytes: number }) {
  const [files, setFiles] = useState(initial);
  const [used, setUsed] = useState(totalBytes);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const upload = async (list: FileList | File[]) => {
    setErrors([]);
    for (const f of Array.from(list)) {
      setBusy(`Uploading ${f.name}…`);
      try {
        const stored = await uploadFile(await prepareFile(f), (p) => setBusy(`Uploading ${f.name}… ${Math.round(p * 100)}%`));
        setFiles((fs) => [{ ...stored, conversations: 0 }, ...fs]);
        setUsed((u) => u + stored.sizeBytes);
      } catch (err) {
        setErrors((e) => [...e, `${f.name}: ${(err as Error).message}`]);
      }
    }
    setBusy(null);
  };

  const remove = async (f: Row) => {
    if (!window.confirm(`Delete "${f.name}"? Maverick will no longer see it in any conversation.`)) return;
    await api(`/api/files/${f.id}`, { method: "DELETE" });
    setFiles((fs) => fs.filter((x) => x.id !== f.id));
    setUsed((u) => u - f.sizeBytes);
  };

  return (
    <div>
      <section className="card">
        <label
          className={`upload-zone${dragging ? " dragging" : ""}`}
          style={{ display: "block", cursor: "pointer" }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload(e.dataTransfer.files);
          }}
        >
          <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => e.target.files && void upload(e.target.files)} aria-label="Upload files" />
          <strong style={{ color: "var(--text)" }}>Drop files here or tap to choose</strong>
          <br />
          <span className="small">PDF (up to 100 pages), photos and screenshots, Word (.docx), text, Markdown, CSV, JSON · up to 10 MB each</span>
        </label>
        {busy && <p className="small muted" role="status" style={{ marginTop: "0.6rem" }}>{busy}</p>}
        {errors.map((e) => (
          <div key={e} className="alert alert-error" style={{ marginTop: "0.6rem", marginBottom: 0 }}>{e}</div>
        ))}
        <p className="hint" style={{ marginTop: "0.6rem" }}>{formatBytes(used)} of 300 MB used · stored encrypted</p>
      </section>

      <section className="card">
        {files.length === 0 ? (
          <p className="empty">No files yet. Upload one above, or attach one in a conversation with the 📎 button.</p>
        ) : (
          <div className="table-wrap">
            <table className="files-table">
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td style={{ width: 56 }}>
                      {f.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="thumb" src={`/api/files/${f.id}?inline=1`} alt="" loading="lazy" />
                      ) : (
                        <span className="thumb-icon" aria-hidden>{KIND_ICON[f.kind]}</span>
                      )}
                    </td>
                    <td style={{ minWidth: 0 }}>
                      <div style={{ overflowWrap: "anywhere" }}>{f.name}</div>
                      <div className="hint" style={{ marginTop: 0 }}>
                        {KIND_LABEL[f.kind]} · {formatBytes(f.sizeBytes)}
                        {f.pages ? ` · ${f.pages} page${f.pages === 1 ? "" : "s"}` : ""} · {formatTokens(f.tokenEstimate)} ·{" "}
                        {new Date(f.createdAt).toLocaleDateString("en-GB")}
                        {f.conversations > 0 && ` · in ${f.conversations} conversation${f.conversations === 1 ? "" : "s"}`}
                      </div>
                    </td>
                    <td>
                      <div className="file-actions">
                        <a className="btn btn-sm btn-primary" href={`/chat?file=${f.id}`}>Ask Maverick</a>
                        <a className="btn btn-sm btn-ghost" href={`/api/files/${f.id}`} aria-label={`Download ${f.name}`}>⬇</a>
                        <button className="btn btn-sm btn-ghost" onClick={() => remove(f)} aria-label={`Delete ${f.name}`}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
