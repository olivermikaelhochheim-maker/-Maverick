"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export interface SuggestionView {
  id: string;
  kind: "memory" | "task" | "goal" | "action";
  title: string;
  body: string | null;
  source: "conversation" | "briefing";
  sourceRef: string | null;
  createdAt: string;
}

const KIND_LABEL: Record<SuggestionView["kind"], string> = {
  memory: "Remember",
  task: "Task",
  goal: "Goal",
  action: "Suggested action",
};

const ACCEPT_LABEL: Record<SuggestionView["kind"], string> = {
  memory: "Save memory",
  task: "Add task",
  goal: "Add goal",
  action: "Add as task",
};

/** Maverick proposes; Oliver decides. Nothing here takes effect until accepted. */
export function SuggestionInbox({ initial, compact = false }: { initial: SuggestionView[]; compact?: boolean }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const act = async (id: string, action: "accept" | "dismiss", title?: string) => {
    setError(null);
    try {
      await api(`/api/suggestions/${id}`, { body: { action, title } });
      setItems((xs) => xs.filter((x) => x.id !== id));
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!items.length) return <p className="empty">Nothing waiting. Maverick&apos;s suggestions from conversations and briefings appear here for your approval.</p>;

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      <ul className="list-plain inbox">
        {(compact ? items.slice(0, 5) : items).map((s) => (
          <li key={s.id} className="inbox-item">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className={`badge ${s.kind === "action" ? "badge-accent" : ""}`}>{KIND_LABEL[s.kind]}</span>
                {editing === s.id ? (
                  <textarea
                    aria-label="Edit suggestion before accepting"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    style={{ marginTop: "0.4rem" }}
                  />
                ) : (
                  <p className="inbox-title">{s.title}</p>
                )}
                {s.body && <p className="small muted" style={{ margin: 0 }}>{s.body}</p>}
                <p className="hint" style={{ marginTop: "0.2rem" }}>
                  From {s.source === "briefing" ? "a briefing" : "a conversation"}
                  {s.sourceRef && s.source === "conversation" && <> · <a href={`/chat/${s.sourceRef}`}>open</a></>}
                </p>
              </div>
            </div>
            <div className="row" style={{ gap: "0.4rem", marginTop: "0.4rem" }}>
              {editing === s.id ? (
                <>
                  <button className="btn btn-sm btn-primary" onClick={() => act(s.id, "accept", draft)}>Save edited</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button className="btn btn-sm btn-primary" onClick={() => act(s.id, "accept")}>{ACCEPT_LABEL[s.kind]}</button>
                  <button className="btn btn-sm" onClick={() => { setEditing(s.id); setDraft(s.title); }}>Edit</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => act(s.id, "dismiss")}>Dismiss</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {compact && items.length > 5 && <p className="small"><a href="/planning#inbox">{items.length - 5} more in the inbox</a></p>}
    </div>
  );
}
