"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JournalEntry } from "@maverick/core";
import { api } from "@/lib/client";
import { fmtDate } from "./shared";

const PROMPTS = [
  ["feel", "How do I feel today?"],
  ["happened", "What happened?"],
  ["well", "What went well?"],
  ["proud", "What am I proud of?"],
  ["avoid", "What did I handle poorly or avoid?"],
  ["control", "What was within my control?"],
  ["learn", "What did I learn?"],
  ["tomorrow", "What will I do differently tomorrow?"],
  ["support", "What support or recovery do I need?"],
] as const;

const RATINGS = [
  ["mood", "Mood", "Low", "Good"],
  ["energy", "Energy", "Drained", "Plenty"],
  ["stress", "Stress", "Calm", "Very high"],
  ["sleepQuality", "Sleep quality", "Poor", "Great"],
] as const;

// Shown alongside the entry, never instead of it. Coaching steps aside.
const CRISIS = /\b(kill myself|killing myself|suicid|end my life|want to die|self[- ]harm|hurt myself|ta livet mitt|selvmord|vil dø|skade meg selv)/i;

type Draft = Omit<JournalEntry, "id" | "createdAt" | "updatedAt"> & { id: string | null };

const blank = (date: string): Draft => ({ id: null, date, body: "", prompts: {}, mood: null, energy: null, stress: null, sleepQuality: null, sleepHours: null, aiAllowed: true });

export function Journal({ initial, today, openId, startNew }: { initial: JournalEntry[]; today: string; openId?: string; startNew?: boolean }) {
  const [entries, setEntries] = useState(initial);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(() => {
    if (openId) {
      const e = initial.find((x) => x.id === openId);
      if (e) return e;
    }
    if (startNew) return initial.find((x) => x.date === today) ?? blank(today);
    return null;
  });
  const [showPrompts, setShowPrompts] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Autosave: one write at a time, the latest draft wins.
  const latest = useRef<Draft | null>(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const save = useCallback(() => {
    chain.current = chain.current.then(async () => {
      const d = latest.current;
      if (!d) return;
      setState("saving");
      try {
        const { id, ...body } = d;
        const res = id
          ? await api<{ entry: JournalEntry }>(`/api/life/journal/${id}`, { method: "PATCH", body })
          : await api<{ entry: JournalEntry }>("/api/life/journal", { body });
        if (!id && latest.current && latest.current.id === null) latest.current = { ...latest.current, id: res.entry.id };
        setDraft((cur) => (cur && cur.id === null ? { ...cur, id: res.entry.id } : cur));
        setEntries((es) => [res.entry, ...es.filter((e) => e.id !== res.entry.id)].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)));
        setState("saved");
        setError(null);
      } catch (err) {
        setState("error");
        setError((err as Error).message);
      }
    });
    return chain.current;
  }, []);

  const change = (patch: Partial<Draft>, delay = 800) => {
    setDraft((cur) => {
      const next = { ...cur!, ...patch };
      latest.current = next;
      return next;
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), delay);
  };

  const flush = async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      await save();
    }
    await chain.current;
  };

  useEffect(() => {
    const onHide = () => {
      if (timer.current) void flush();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  });

  const open = (d: Draft | null) => {
    latest.current = d;
    setDraft(d);
    setShowPrompts(!!d && Object.values(d.prompts).some(Boolean));
    setConfirmDelete(false);
    setState("idle");
    window.scrollTo(0, 0);
  };

  const remove = async () => {
    if (!draft?.id) return open(null);
    if (timer.current) clearTimeout(timer.current);
    await chain.current;
    try {
      await api(`/api/life/journal/${draft.id}`, { method: "DELETE" });
      setEntries((es) => es.filter((e) => e.id !== draft.id));
      open(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const search = async (value: string) => {
    setQ(value);
    try {
      setEntries((await api<{ entries: JournalEntry[] }>(`/api/life/journal${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ""}`)).entries);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!draft) {
    return (
      <div>
        <div className="toolbar">
          <label htmlFor="j-search" className="sr-only">Search entries</label>
          <input id="j-search" type="search" placeholder="Search your entries" value={q} onChange={(e) => void search(e.target.value)} />
          <button className="btn btn-primary" onClick={() => open(entries.find((e) => e.date === today) ?? blank(today))}>Write today&apos;s entry</button>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {entries.length ? (
          <ul className="entry-list">
            {entries.map((e) => (
              <li key={e.id}>
                <button className="entry-card" onClick={() => open(e)}>
                  <span className="faint small">{fmtDate(e.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="entry-snippet">{(e.body || Object.values(e.prompts).join(" ")).slice(0, 220) || <span className="faint">Ratings only</span>}</span>
                  <span className="row" style={{ gap: "0.35rem" }}>
                    {e.mood !== null && <span className="badge">Mood {e.mood}</span>}
                    {e.energy !== null && <span className="badge">Energy {e.energy}</span>}
                    {!e.aiAllowed && <span className="badge">Private from Maverick</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">{q ? "No entries match that search." : "No entries yet. Start with today."}</p>
        )}
      </div>
    );
  }

  const allText = [draft.body, ...Object.values(draft.prompts)].join(" ");
  const hasText = allText.trim().length > 0;
  const discuss = () => {
    const parts = [draft.body.slice(0, 1500), ...PROMPTS.filter(([k]) => draft.prompts[k]).map(([k, l]) => `${l} ${draft.prompts[k]!.slice(0, 250)}`)].filter(Boolean);
    const q = `Here is my journal entry for ${draft.date}. Give me direct, practical feedback: briefly reflect what happened, name specific progress, point out an inconsistency or avoidance only if my habits, goals or entries support it (with dates), separate real constraints from avoidable behaviour, and suggest one to three small next actions.\n\n${parts.join("\n\n")}`;
    void flush().then(() => (window.location.href = `/chat?q=${encodeURIComponent(q.slice(0, 2500))}`));
  };

  return (
    <div className="journal-editor">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => void flush().then(() => open(null))}>← All entries</button>
        <span className="faint small" role="status">
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Not saved" : draft.id ? "Saved" : "Draft · saves as you write"}
        </span>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <label htmlFor="j-date" className="sr-only">Date</label>
      <input id="j-date" className="journal-date" type="date" max={today} value={draft.date} onChange={(e) => e.target.value && change({ date: e.target.value }, 0)} />

      <div className="ratings card">
        {RATINGS.map(([k, label, lo, hi]) => (
          <div className="rating" key={k}>
            <span className="rating-label">{label}</span>
            <div className="segmented" role="radiogroup" aria-label={label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={draft[k] === n} className={draft[k] === n ? "on" : ""} onClick={() => change({ [k]: draft[k] === n ? null : n } as Partial<Draft>, 0)}>
                  {n}
                </button>
              ))}
            </div>
            <span className="faint small">{lo} → {hi}</span>
          </div>
        ))}
        <div className="rating">
          <label className="rating-label" htmlFor="j-sleep">Hours slept</label>
          <input id="j-sleep" type="number" min={0} max={24} step={0.5} style={{ maxWidth: 110 }} value={draft.sleepHours ?? ""} onChange={(e) => change({ sleepHours: e.target.value === "" ? null : Number(e.target.value) })} />
        </div>
      </div>

      <label htmlFor="j-body" className="sr-only">Entry</label>
      <textarea id="j-body" className="journal-body" rows={10} placeholder="Write freely. Nothing here is required." value={draft.body} onChange={(e) => change({ body: e.target.value })} />

      <button className="btn btn-ghost btn-sm" aria-expanded={showPrompts} onClick={() => setShowPrompts(!showPrompts)}>
        {showPrompts ? "Hide guided prompts" : "Answer guided prompts"}
      </button>
      {showPrompts &&
        PROMPTS.map(([k, label]) => (
          <div className="field" key={k}>
            <label htmlFor={`jp-${k}`} className="prompt-label">{label}</label>
            <textarea id={`jp-${k}`} rows={2} value={draft.prompts[k] ?? ""} onChange={(e) => change({ prompts: { ...draft.prompts, [k]: e.target.value } })} />
          </div>
        ))}

      {CRISIS.test(allText) && (
        <div className="alert alert-warn" role="note">
          <strong>If you are not safe right now, please reach out to someone now.</strong> In Norway: emergency <strong>113</strong>, Mental Helse <strong>116 123</strong>, Kirkens SOS <strong>22 40 00 40</strong> (both helplines are open around the clock). Coaching can wait.
        </div>
      )}

      <section className="card" style={{ marginTop: "1rem" }}>
        <label className="check">
          <input type="checkbox" checked={draft.aiAllowed} onChange={(e) => change({ aiAllowed: e.target.checked }, 0)} />
          Maverick may read this entry
        </label>
        <p className="hint">
          {draft.aiAllowed
            ? "Used in your evening check-in (today's entry) and weekly review. Ratings may appear in chat context. Nothing is sent until one of those runs."
            : "Excluded from briefings, chat context and reviews. Stored encrypted like everything else."}
        </p>
        {draft.aiAllowed && (
          <button className="btn btn-sm" disabled={!hasText} onClick={discuss}>
            Get feedback from Maverick
          </button>
        )}
      </section>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: "1rem" }}>
        {confirmDelete ? (
          <>
            <span className="small">Delete this entry permanently?</span>
            <button className="btn btn-danger btn-sm" onClick={() => void remove()}>Delete</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(true)}>Delete entry</button>
        )}
      </div>
    </div>
  );
}
