"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { kickLive, useLive } from "@/lib/live";
import { AICore } from "./AICore";

/** The core, bound to live engine state. */
export function LiveCore({ size = 170 }: { size?: number }) {
  const { core, coreDetail } = useLive();
  return <AICore state={core} size={size} detail={coreDetail} />;
}

/** One line for everything: a mission when it matches one, otherwise a question for Maverick. */
export function CommandInput() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await api<{ route: "mission" | "chat"; mission?: { id: string; title: string } }>("/api/command", { body: { text: t } });
      if (r.route === "mission" && r.mission) {
        toast({ text: `Mission launched: ${r.mission.title}`, link: { label: "Open", href: `/missions/${r.mission.id}` } });
        kickLive();
        router.push(`/missions/${r.mission.id}`);
      } else router.push(`/chat?q=${encodeURIComponent(t)}`);
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
      setBusy(false);
    }
  };
  return (
    <form className="cc-command" onSubmit={submit}>
      <input aria-label="Command line" value={text} onChange={(e) => setText(e.target.value)} placeholder="> prepare me for tomorrow · situation report · ask anything" disabled={busy} />
      <button className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? "…" : "Execute"}</button>
    </form>
  );
}

/** Launch a template mission in one tap. */
export function LaunchButton({ template, label, primary = false, params }: { template: string; label: string; primary?: boolean; params?: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`btn${primary ? " btn-primary" : ""}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ mission: { id: string; title: string } }>("/api/missions", { body: { template, params } });
          toast({ text: `Mission launched: ${r.mission.title}`, link: { label: "Open", href: `/missions/${r.mission.id}` } });
          kickLive();
          router.push(`/missions/${r.mission.id}`);
        } catch (err) {
          toast({ text: (err as Error).message, kind: "error" });
          setBusy(false);
        }
      }}
    >
      {busy ? "Launching…" : label}
    </button>
  );
}

const KEY = "mvk:cc-hidden";

/** Command Center widgets: show/hide per device (stored in this browser). */
export function WidgetBoard({ widgets }: { widgets: { id: string; label: string; span: number; node: ReactNode; alert?: boolean }[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    try {
      setHidden(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {
      /* private mode: show everything */
    }
  }, []);
  const toggle = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    setHidden(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", margin: "0.4rem 0 0.6rem" }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>{editing ? "Done" : "Customise panels"}</button>
      </div>
      {editing && (
        <div className="card widget-toggle flat" role="group" aria-label="Panels to show">
          {widgets.map((w) => (
            <label key={w.id}><input type="checkbox" checked={!hidden.includes(w.id)} onChange={() => toggle(w.id)} /> {w.label}</label>
          ))}
        </div>
      )}
      <div className="cards">
        {widgets.filter((w) => !hidden.includes(w.id)).map((w) => (
          <section key={w.id} className={`card span-${w.span}${w.alert ? " alert-panel" : ""}`} aria-label={w.label}>
            {w.node}
          </section>
        ))}
      </div>
    </>
  );
}
