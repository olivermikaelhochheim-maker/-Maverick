"use client";

import Link from "next/link";
import { useState } from "react";

interface Ev { id: number; missionId: string | null; level: "info" | "success" | "warn" | "error"; kind: string; message: string; createdAt: string }
interface Au { id: number; actor: string; action: string; target: string | null; details: Record<string, unknown>; createdAt: string }

const stamp = (iso: string, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export function LogsView({ events, audit, tz }: { events: Ev[]; audit: Au[]; tz: string }) {
  const [tab, setTab] = useState<"agent" | "audit">("agent");
  const [level, setLevel] = useState("");
  const [q, setQ] = useState("");
  const lower = q.toLowerCase();
  const ev = events.filter((e) => (!level || e.level === level) && (!lower || e.message.toLowerCase().includes(lower) || e.kind.includes(lower)));
  const au = audit.filter((a) => !lower || a.action.includes(lower) || a.actor.includes(lower));
  return (
    <section className="card">
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Log">
          <button aria-pressed={tab === "agent"} onClick={() => setTab("agent")}>Agent execution ({events.length})</button>
          <button aria-pressed={tab === "audit"} onClick={() => setTab("audit")}>Audit log ({audit.length})</button>
        </div>
        <input aria-label="Search logs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        {tab === "agent" && (
          <select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">All levels</option>
            <option value="success">Success</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        )}
      </div>
      {tab === "agent" ? (
        ev.length ? (
          <ul className="feed">
            {ev.map((e) => (
              <li key={e.id} style={{ gridTemplateColumns: "118px 10px minmax(0,1fr)" }}>
                <span className="t">{stamp(e.createdAt, tz)}</span>
                <span className={`lv ${e.level}`} aria-label={e.level} />
                <span className="m">
                  <span className="tele" style={{ marginRight: 6 }}>{e.kind}</span>
                  {e.missionId ? <Link href={`/missions/${e.missionId}`}>{e.message}</Link> : e.message}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="empty">No matching events.</p>
      ) : au.length ? (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {au.map((a) => (
                <tr key={a.id}>
                  <td className="mono small">{stamp(a.createdAt, tz)}</td>
                  <td className="small">{a.actor}</td>
                  <td className="mono small">{a.action}</td>
                  <td className="small faint" style={{ overflowWrap: "anywhere" }}>{Object.keys(a.details ?? {}).length ? JSON.stringify(a.details) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="empty">No matching entries.</p>}
    </section>
  );
}
