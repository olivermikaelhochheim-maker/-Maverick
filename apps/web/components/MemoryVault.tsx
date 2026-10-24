"use client";

import { useMemo, useState } from "react";
import type { Memory, MemoryCategory, Retention } from "@maverick/core";
import { api } from "@/lib/client";

const CATEGORIES: Record<MemoryCategory, string> = {
  profile: "Profile facts",
  preference: "Preferences",
  goal: "Goals",
  project: "Projects",
  decision: "Decisions",
  episodic: "Past events",
  ephemeral: "Short-term context",
};
const RETENTION: Record<Retention, string> = { permanent: "Keep", "1y": "1 year", "90d": "90 days", "30d": "30 days", "7d": "7 days" };

function provenance(m: Memory): string {
  const when = new Date(m.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (m.source === "user") return `Added by you · ${when}`;
  const where = m.source === "briefing" ? "a briefing" : m.source === "import" ? "an import" : "a conversation";
  return `Suggested from ${where}, approved by you · confidence ${Math.round(m.confidence * 100)}% · ${when}`;
}

export function MemoryVault({ initial }: { initial: Memory[] }) {
  const [memories, setMemories] = useState(initial);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | MemoryCategory>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memories.filter((m) => (cat === "all" || m.category === cat) && (!q || m.content.toLowerCase().includes(q)));
  }, [memories, query, cat]);

  const save = async (id: string, patch: Partial<Pick<Memory, "content" | "category" | "retention" | "pinned">>) => {
    setError(null);
    try {
      const { memory } = await api<{ memory: Memory }>(`/api/memories/${id}`, { method: "PATCH", body: patch });
      setMemories((ms) => ms.map((m) => (m.id === id ? memory : m)));
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (m: Memory) => {
    if (!window.confirm("Delete this memory permanently? Maverick will no longer know it.")) return;
    try {
      await api(`/api/memories/${m.id}`, { method: "DELETE" });
      setMemories((ms) => ms.filter((x) => x.id !== m.id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError(null);
    try {
      const { memory } = await api<{ memory: Memory }>("/api/memories", { body: { content: f.get("content"), category: f.get("category") } });
      setMemories((ms) => [memory, ...ms]);
      form.reset();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <section className="card">
        <h2>Add something Maverick should know</h2>
        <form onSubmit={add}>
          <div className="inline-form">
            <label htmlFor="m-content" className="sr-only">Memory</label>
            <input id="m-content" name="content" required maxLength={2000} placeholder="e.g. I do my best work before 11:00" />
            <button className="btn btn-primary">Add</button>
          </div>
          <div style={{ marginTop: "0.5rem", maxWidth: 260 }}>
            <label htmlFor="m-cat">Category</label>
            <select id="m-cat" name="category" defaultValue="profile">
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="toolbar">
          <label htmlFor="m-search" className="sr-only">Search memories</label>
          <input id="m-search" type="search" placeholder="Search memories…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label htmlFor="m-filter" className="sr-only">Category filter</label>
          <select id="m-filter" value={cat} onChange={(e) => setCat(e.target.value as typeof cat)}>
            <option value="all">All categories ({memories.length})</option>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v} ({memories.filter((m) => m.category === k).length})</option>
            ))}
          </select>
          <a className="btn btn-sm" href="/api/export">Export all data</a>
        </div>
        {shown.length === 0 ? (
          <p className="empty">{memories.length ? "Nothing matches." : "No memories yet. Add one above, or accept Maverick's suggestions from conversations."}</p>
        ) : (
          <ul className="list-plain">
            {shown.map((m) => (
              <li key={m.id} className="mem-item">
                {editing === m.id ? (
                  <div>
                    <label htmlFor={`edit-${m.id}`} className="sr-only">Edit memory</label>
                    <textarea id={`edit-${m.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
                    <div className="row" style={{ gap: "0.4rem", marginTop: "0.4rem" }}>
                      <button className="btn btn-sm btn-primary" onClick={() => save(m.id, { content: draft })}>Save</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}>
                    <p style={{ margin: 0, overflowWrap: "anywhere" }}>{m.pinned && <span title="Pinned: always given to Maverick">📌 </span>}{m.content}</p>
                    <div className="row" style={{ gap: "0.2rem", flexWrap: "nowrap" }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(m.id); setDraft(m.content); }}>Edit</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => remove(m)}>Delete</button>
                    </div>
                  </div>
                )}
                <div className="mem-meta">
                  <span className="badge">{CATEGORIES[m.category]}</span>
                  <span>{provenance(m)}</span>
                  {m.lastUsedAt && <span>last used {new Date(m.lastUsedAt).toLocaleDateString("en-GB")}</span>}
                  <label>
                    <span className="sr-only">Retention</span>
                    <select value={m.retention} onChange={(e) => save(m.id, { retention: e.target.value as Retention })} title="How long to keep this">
                      {Object.entries(RETENTION).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </label>
                  {m.expiresAt && <span>expires {new Date(m.expiresAt).toLocaleDateString("en-GB")}</span>}
                  <button className="btn btn-sm btn-ghost" style={{ minHeight: 28 }} onClick={() => save(m.id, { pinned: !m.pinned })}>{m.pinned ? "Unpin" : "Pin"}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
