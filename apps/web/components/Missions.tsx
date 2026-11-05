"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { kickLive, MODE_LABEL, timeHM, useLive } from "@/lib/live";
import { Markdown } from "./Markdown";

export interface UiStep {
  id: string;
  idx: number;
  agent: string;
  tool: string;
  toolLabel: string;
  title: string;
  preview: string;
  risk: "read" | "low" | "medium" | "high";
  status: "pending" | "awaiting_approval" | "recommended" | "running" | "done" | "failed" | "skipped";
  decision: string | null;
  decisionReason: string | null;
  approved: boolean;
  output: string | null;
  error: string | null;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
}
export interface UiMission {
  id: string;
  template: string;
  title: string;
  objective: string;
  criteria: string | null;
  status: "proposed" | "running" | "awaiting_approval" | "paused" | "completed" | "failed" | "cancelled";
  mode: number;
  priority: number;
  deadline: string | null;
  source: string;
  planner: string;
  report: string | null;
  costUsd: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  steps: UiStep[];
}
export interface UiTemplate {
  id: string;
  label: string;
  description: string;
  params: { key: string; label: string; required: boolean; placeholder?: string }[];
}

const STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  running: "Running",
  awaiting_approval: "Needs approval",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  pending: "Pending",
  recommended: "Recommended",
  done: "Done",
  skipped: "Skipped",
};

export function StatusTag({ s }: { s: string }) {
  return <span className={`st ${s}`}>{STATUS_LABEL[s] ?? s}</span>;
}

export function StepBar({ steps }: { steps: UiStep[] }) {
  return (
    <div className="progress-segs" aria-label={`${steps.filter((s) => s.status === "done").length} of ${steps.length} steps done`}>
      {steps.map((s) => <i key={s.id} className={s.status} title={`${s.title}: ${STATUS_LABEL[s.status]}`} />)}
    </div>
  );
}

export function MissionList({ missions, empty }: { missions: UiMission[]; empty: string }) {
  if (!missions.length) return <p className="empty">{empty}</p>;
  return (
    <div>
      {missions.map((m) => (
        <Link key={m.id} href={`/missions/${m.id}`} className="mission-row">
          <div style={{ minWidth: 0 }}>
            <div className="name">{m.title}</div>
            <div className="tele" style={{ marginTop: 2 }}>
              {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(m.createdAt))} · mode {m.mode} · {m.source}
              {m.costUsd > 0 ? ` · $${m.costUsd.toFixed(3)}` : ""}
            </div>
            <StepBar steps={m.steps} />
          </div>
          <StatusTag s={m.status} />
        </Link>
      ))}
    </div>
  );
}

/** Start a mission from a template or a free-form objective. */
export function MissionLauncher({ templates, globalMode, live, preset }: { templates: UiTemplate[]; globalMode: number; live: boolean; preset?: string }) {
  const router = useRouter();
  const [sel, setSel] = useState<string>(preset ?? templates[0]?.id ?? "custom");
  const [params, setParams] = useState<Record<string, string>>({});
  const [objective, setObjective] = useState("");
  const [mode, setMode] = useState(globalMode);
  const [propose, setPropose] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = templates.find((x) => x.id === sel);

  const launch = async () => {
    setBusy(true);
    try {
      const body = sel === "custom" ? { objective, mode, propose } : { template: sel, params, mode, propose };
      const r = await api<{ mission: UiMission }>("/api/missions", { body });
      toast({ text: `${propose ? "Mission planned" : "Mission launched"}: ${r.mission.title}`, link: { label: "Open", href: `/missions/${r.mission.id}` } });
      kickLive();
      router.push(`/missions/${r.mission.id}`);
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="template-grid" role="group" aria-label="Mission type">
        {templates.map((x) => (
          <button key={x.id} type="button" className="template-card" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
            <strong>{x.label}</strong>
            <div className="d">{x.description}</div>
          </button>
        ))}
        <button type="button" className="template-card" aria-pressed={sel === "custom"} onClick={() => setSel("custom")}>
          <strong>Custom objective</strong>
          <div className="d">{live ? "Describe it; the AI planner picks steps from the registered tools only." : "Mock mode: a safe read-only plan that gathers context. The AI planner needs a live model."}</div>
        </button>
      </div>
      <div style={{ marginTop: "1rem" }}>
        {sel === "custom" ? (
          <div className="field">
            <label htmlFor="obj">Objective</label>
            <textarea id="obj" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="e.g. Get me ready for the statistics exam on 20 November" />
          </div>
        ) : (
          t?.params.map((p) => (
            <div className="field" key={p.key}>
              <label htmlFor={`p-${p.key}`}>{p.label}{p.required ? "" : " (optional)"}</label>
              <input id={`p-${p.key}`} value={params[p.key] ?? ""} placeholder={p.placeholder} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })} />
            </div>
          ))
        )}
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ minWidth: 200 }}>
            <label htmlFor="mode">Autonomy for this mission</label>
            <select id="mode" value={mode} onChange={(e) => setMode(Number(e.target.value))}>
              {[1, 2, 3, 4].filter((n) => n <= globalMode).map((n) => <option key={n} value={n}>{n} · {MODE_LABEL[n]}</option>)}
            </select>
          </div>
          <label className="check" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={propose} onChange={(e) => setPropose(e.target.checked)} /> Show me the plan first
          </label>
          <button className="btn btn-primary" onClick={launch} disabled={busy || (sel === "custom" && objective.trim().length < 4)} style={{ marginLeft: "auto" }}>
            {busy ? "Planning…" : propose ? "Plan mission" : "Launch mission"}
          </button>
        </div>
        <p className="hint">Missions can run at or below your global mode ({globalMode} · {MODE_LABEL[globalMode]}). Every step is checked against your permissions when it's about to run.</p>
      </div>
    </div>
  );
}

/** Live view of one mission: plan, approvals, outputs, report, log. */
export function MissionView({ initial, initialEvents, tz }: { initial: UiMission; initialEvents: { id: number; level: string; message: string; createdAt: string }[]; tz: string }) {
  const [m, setM] = useState(initial);
  const [events, setEvents] = useState(initialEvents);
  const [busy, setBusy] = useState(false);
  const { data } = useLive();
  const active = ["running", "awaiting_approval"].includes(m.status);

  const load = useCallback(async () => {
    try {
      const r = await api<{ mission: UiMission; events: typeof initialEvents }>(`/api/missions/${initial.id}`);
      setM(r.mission);
      setEvents(r.events);
    } catch {
      /* keep the last view */
    }
  }, [initial.id]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 2000);
    return () => clearInterval(t);
  }, [active, load]);
  // Approvals made from the side panel show up here too.
  useEffect(() => {
    void load();
  }, [data?.status.awaitingApproval, load]);

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (msg) toast(msg);
      kickLive();
      await load();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };
  const step = (id: string, action: "approve" | "reject" | "run") => act(() => api(`/api/missions/steps/${id}`, { body: { action } }), action === "reject" ? "Rejected. That step won't run." : "Approved for this step only. Running it now.");
  const mission = (action: "launch" | "pause" | "cancel" | "resume") => act(() => api(`/api/missions/${m.id}`, { body: { action } }));
  const done = m.steps.filter((s) => s.status === "done").length;

  return (
    <div className="cards">
      <section className="card span-12">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="tele">Mission · {m.template.replace(/_/g, " ")} · planned by {m.planner.startsWith("model") ? "AI planner" : m.planner}</span>
            <h1 style={{ margin: "0.2rem 0" }}>{m.title}</h1>
            <p className="muted" style={{ margin: 0 }}><strong>Objective:</strong> {m.objective}</p>
            {m.criteria && <p className="small faint" style={{ margin: "0.3rem 0 0" }}>Done when: {m.criteria}</p>}
          </div>
          <StatusTag s={m.status} />
        </div>
        <StepBar steps={m.steps} />
        <div className="telemetry" style={{ marginTop: "0.9rem" }}>
          <div><span className="tele">Progress</span><div className="v">{done}/{m.steps.length} steps</div></div>
          <div><span className="tele">Autonomy</span><div className="v">{m.mode} · {MODE_LABEL[m.mode]}</div></div>
          <div><span className="tele">Model cost</span><div className="v">${m.costUsd.toFixed(4)}</div></div>
          <div><span className="tele">Started</span><div className="v">{m.startedAt ? timeHM(m.startedAt, tz) : "not yet"}</div></div>
          <div><span className="tele">Finished</span><div className="v">{m.finishedAt ? timeHM(m.finishedAt, tz) : "—"}</div></div>
        </div>
        <div className="row" style={{ marginTop: "0.9rem" }}>
          {m.status === "proposed" && <button className="btn btn-primary" disabled={busy} onClick={() => mission("launch")}>Launch mission</button>}
          {m.status === "paused" && <button className="btn btn-primary" disabled={busy} onClick={() => mission("resume")}>Resume</button>}
          {active && <button className="btn" disabled={busy} onClick={() => mission("pause")}>Pause</button>}
          {["proposed", "running", "awaiting_approval", "paused"].includes(m.status) && (
            <button className="btn btn-danger" disabled={busy} onClick={() => window.confirm("Cancel this mission? Steps not yet run will be skipped.") && mission("cancel")}>Cancel mission</button>
          )}
          {data?.status.halted && <span className="badge badge-danger">Emergency stop on: nothing runs</span>}
        </div>
      </section>

      <section className="card span-7" aria-labelledby="h-plan">
        <div className="card-head"><h3 id="h-plan">Operations</h3><span className="tele">fixed plan · {m.steps.length} steps</span></div>
        <ol className="steps">
          {m.steps.map((s) => (
            <li key={s.id} className={`step ${s.status}`}>
              <span className="n">{s.idx + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div className="head">
                  <span className="title">{s.title}</span>
                  <StatusTag s={s.status} />
                  <span className={`risk ${s.risk}`}>{s.risk}</span>
                </div>
                <div className="meta">
                  {s.agent} agent · {s.toolLabel} · {s.preview}
                  {s.decisionReason ? ` · ${s.decisionReason}` : ""}
                  {s.attempts > 1 ? ` · attempt ${s.attempts}` : ""}
                </div>
                {s.status === "awaiting_approval" && (
                  <div className="row" style={{ marginTop: "0.5rem" }}>
                    <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => step(s.id, "approve")}>Approve this step</button>
                    <button className="btn btn-sm" disabled={busy} onClick={() => step(s.id, "reject")}>Reject</button>
                  </div>
                )}
                {s.status === "recommended" && (
                  <div className="row" style={{ marginTop: "0.5rem" }}>
                    <button className="btn btn-sm" disabled={busy} onClick={() => step(s.id, "run")}>Run it now</button>
                    <span className="small faint">Recommended, not executed.</span>
                  </div>
                )}
                {s.status === "done" && s.output && s.tool !== "report.compose" && <div className="out"><Markdown text={s.output} /></div>}
                {(s.status === "failed" || s.status === "skipped") && s.error && <div className="out" style={{ color: s.status === "failed" ? "#ffb4b4" : "var(--muted)" }}>{s.error}</div>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card span-5" aria-labelledby="h-log">
        <div className="card-head"><h3 id="h-log">Execution log</h3><span className="tele">{events.length} events</span></div>
        {events.length ? (
          <ul className="feed">
            {events.map((e) => (
              <li key={e.id}>
                <span className="t">{timeHM(e.createdAt, tz)}</span>
                <span className={`lv ${e.level}`} />
                <span className="m">{e.message}</span>
              </li>
            ))}
          </ul>
        ) : <p className="empty">Nothing logged yet.</p>}
      </section>

      <section className="card span-12" aria-labelledby="h-report">
        <div className="card-head"><h3 id="h-report">Review</h3>{m.report && <button className="btn btn-sm btn-ghost" onClick={() => void navigator.clipboard?.writeText(m.report!).then(() => toast("Report copied."))}>Copy</button>}</div>
        {m.report ? <div className="report"><Markdown text={m.report} /></div> : <p className="empty">The report is written when the mission's final step runs.</p>}
      </section>
    </div>
  );
}
