"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { kickLive, timeHM, useLive } from "@/lib/live";

export function Approvals({ compact = false }: { compact?: boolean }) {
  const { data, refresh } = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const list = data?.approvals ?? [];
  const act = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    try {
      await api(`/api/missions/steps/${id}`, { body: { action } });
      toast(action === "approve" ? "Approved. Running it now." : "Rejected. That step won't run.");
      await refresh();
      kickLive();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(null);
    }
  };
  if (!list.length) return <p className="empty small">{compact ? "Nothing waiting for you." : "No approvals waiting. Steps that need your go-ahead appear here."}</p>;
  return (
    <div>
      {list.map((a) => (
        <div key={a.id} className="approval">
          <div className="row" style={{ justifyContent: "space-between", gap: "0.4rem" }}>
            <span className="tele" style={{ color: "var(--warn)" }}>{a.agent} · <span className={`risk ${a.risk}`}>{a.risk}</span></span>
            <Link className="small" href={`/missions/${a.missionId}`}>{a.missionTitle}</Link>
          </div>
          <div className="what">{a.preview}</div>
          <div className="row">
            <button className="btn btn-sm btn-primary" disabled={busy === a.id} onClick={() => act(a.id, "approve")}>Approve</button>
            <button className="btn btn-sm" disabled={busy === a.id} onClick={() => act(a.id, "reject")}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityFeed({ limit = 12, tz }: { limit?: number; tz?: string }) {
  const { data } = useLive();
  const ev = (data?.events ?? []).slice(0, limit);
  if (!ev.length) return <p className="empty small">No agent activity yet. Launch a mission and every step is logged here.</p>;
  return (
    <ul className="feed" aria-live="polite">
      {ev.map((e) => (
        <li key={e.id}>
          <span className="t">{timeHM(e.createdAt, tz)}</span>
          <span className={`lv ${e.level}`} aria-label={e.level} />
          <span className="m">{e.missionId ? <Link href={`/missions/${e.missionId}`}>{e.message}</Link> : e.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function IntelPanel({ tz, onNavigate }: { tz: string; onNavigate?: () => void }) {
  const { data, core, coreDetail } = useLive();
  const s = data?.status;
  const next = s?.automations.nextRun;
  return (
    <div onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate?.()}>
      <section>
        <h3>Status <span className={`st ${core === "alert" || core === "listening" ? "awaiting_approval" : core === "complete" ? "done" : core === "executing" ? "running" : "pending"}`}>{core}</span></h3>
        <p className="small muted" style={{ margin: 0 }}>{coreDetail}</p>
      </section>
      <section>
        <h3>Approvals {s?.awaitingApproval ? <span className="badge badge-warn">{s.awaitingApproval}</span> : null}</h3>
        <Approvals compact />
      </section>
      <section>
        <h3>Background</h3>
        <ul className="feed">
          <li><span className="t">ENG</span><span className={`lv ${s?.halted ? "error" : "success"}`} /><span className="m">{s?.halted ? "Halted by emergency stop" : s?.running ? `${s.running} mission${s.running === 1 ? "" : "s"} active` : "Executor idle (checks every 3 s)"}</span></li>
          <li><span className="t">AUTO</span><span className={`lv ${s?.automations.enabled ? "success" : "info"}`} /><span className="m">{s?.automations.enabled ? `${s.automations.enabled} automation${s.automations.enabled === 1 ? "" : "s"}${next ? ` · next ${new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(next))}` : ""}` : <Link href="/automations">No automations scheduled</Link>}</span></li>
          <li><span className="t">LIMIT</span><span className="lv" /><span className="m">{s ? `${s.autoActionsToday}/${s.dailyAutoActions} automatic actions today` : "…"}</span></li>
        </ul>
      </section>
      <section>
        <h3>Live activity <Link className="small" href="/logs">All logs</Link></h3>
        <ActivityFeed tz={tz} />
      </section>
    </div>
  );
}
