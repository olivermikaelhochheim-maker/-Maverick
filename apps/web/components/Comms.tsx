"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";

interface Draft { id: string; missionId: string | null; to: string; subject: string; body: string; status: "draft" | "handed_off" | "discarded"; writtenBy: "model" | "template" | "user"; updatedAt: string }

function mailto(d: Pick<Draft, "to" | "subject" | "body">) {
  const q = new URLSearchParams({ subject: d.subject, body: d.body }).toString().replace(/\+/g, "%20");
  return `mailto:${d.to.split(/[,;]\s*/).filter(Boolean).map(encodeURIComponent).join(",")}?${q}`;
}

export function CommsView({ initial, live, name }: { initial: Draft[]; live: boolean; name: string }) {
  const [drafts, setDrafts] = useState(initial);
  const [sel, setSel] = useState<string | null>(initial[0]?.id ?? null);
  const [edit, setEdit] = useState<Draft | null>(initial[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState({ to: "", subject: "", purpose: "" });

  const pick = (d: Draft) => {
    setSel(d.id);
    setEdit({ ...d });
  };
  const save = async (patch: Partial<Draft>, msg?: string) => {
    if (!edit) return;
    setBusy(true);
    try {
      const r = await api<{ draft: Draft }>(`/api/drafts/${edit.id}`, { method: "PATCH", body: { to: edit.to, subject: edit.subject, body: edit.body, ...patch } });
      setDrafts((ds) => (r.draft.status === "discarded" ? ds.filter((x) => x.id !== r.draft.id) : ds.map((x) => (x.id === r.draft.id ? r.draft : x))));
      setEdit(r.draft.status === "discarded" ? null : r.draft);
      if (msg) toast(msg);
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };
  const blank = async () => {
    setBusy(true);
    try {
      const r = await api<{ draft: Draft }>("/api/drafts", { body: { to: "", subject: "New email", body: `Hi,\n\n\n\nBest regards,\n${name}` } });
      setDrafts([r.draft, ...drafts]);
      pick(r.draft);
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };
  const writeWithMaverick = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ mission: { id: string } }>("/api/missions", { body: { template: "draft_email", params: ask } });
      toast({ text: "Drafting mission launched. The draft appears here when it's written.", link: { label: "Watch", href: `/missions/${r.mission.id}` } });
      setAsk({ to: "", subject: "", purpose: "" });
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cards">
      <section className="card span-12" aria-labelledby="h-write">
        <div className="card-head"><h3 id="h-write">Ask Maverick to draft</h3><span className="tele">{live ? "written by the AI model" : "mock mode: a template you fill in"}</span></div>
        <form className="form-grid" onSubmit={writeWithMaverick}>
          <input aria-label="Recipient for the new draft" placeholder="To (optional) name@example.com" value={ask.to} onChange={(e) => setAsk({ ...ask, to: e.target.value })} />
          <input aria-label="Subject for the new draft" placeholder="Subject" value={ask.subject} onChange={(e) => setAsk({ ...ask, subject: e.target.value })} required />
          <input aria-label="What it should say" placeholder="What it should say or achieve" value={ask.purpose} onChange={(e) => setAsk({ ...ask, purpose: e.target.value })} required />
          <button className="btn btn-primary" disabled={busy}>Draft it</button>
        </form>
        <p className="hint">Maverick can't send email: there is no Gmail connection and no send tool. "Open in Mail" puts the draft in your own mail app, and you press Send there.</p>
      </section>

      <section className="card span-4" aria-labelledby="h-drafts">
        <div className="card-head"><h3 id="h-drafts">Drafts</h3><button className="btn btn-sm" onClick={blank} disabled={busy}>New</button></div>
        {drafts.length ? (
          <ul className="list-plain">
            {drafts.map((d) => (
              <li key={d.id}>
                <button className="item" style={{ background: "none", border: 0, color: "inherit", font: "inherit", textAlign: "left", width: "100%", cursor: "pointer", padding: "0.6rem 0" }} aria-current={sel === d.id} onClick={() => pick(d)}>
                  <strong style={{ color: sel === d.id ? "var(--accent)" : undefined }}>{d.subject}</strong>
                  <div className="small faint">{d.to || "no recipient"} · {d.status === "handed_off" ? "opened in Mail" : "draft"} · {d.writtenBy}</div>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="empty">No drafts yet.</p>}
      </section>

      <section className="card span-8" aria-labelledby="h-edit">
        <div className="card-head"><h3 id="h-edit">Draft</h3>{edit?.missionId && <Link className="small" href={`/missions/${edit.missionId}`}>From mission</Link>}</div>
        {edit ? (
          <div>
            <div className="field"><label htmlFor="d-to">To</label><input id="d-to" value={edit.to} onChange={(e) => setEdit({ ...edit, to: e.target.value })} placeholder="name@example.com" /></div>
            <div className="field"><label htmlFor="d-sub">Subject</label><input id="d-sub" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></div>
            <div className="field"><label htmlFor="d-body">Body</label><textarea id="d-body" rows={12} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></div>
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => save({}, "Draft saved.")}>Save</button>
              <a
                className="btn btn-primary"
                href={mailto(edit)}
                onClick={() => void save({ status: "handed_off" })}
              >
                Open in Mail
              </a>
              <button className="btn" disabled={busy} onClick={() => void navigator.clipboard?.writeText(`${edit.subject}\n\n${edit.body}`).then(() => toast("Copied."))}>Copy</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => window.confirm("Discard this draft?") && save({ status: "discarded" }, "Draft discarded.")} style={{ marginLeft: "auto" }}>Discard</button>
            </div>
            {edit.writtenBy === "model" && <p className="hint">Written by the AI model. Check facts, names and dates before you send.</p>}
          </div>
        ) : <p className="empty">Pick a draft, or create one.</p>}
      </section>
    </div>
  );
}
