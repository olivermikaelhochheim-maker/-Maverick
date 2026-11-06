"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";

type Status = "accepted" | "pending" | "never" | "snoozed" | "eligible" | "waiting" | "locked" | "done_for_now";
interface Item {
  id: string;
  domain: string;
  title: string;
  why: string;
  when: string;
  effort: "S" | "M" | "L";
  status: Status;
  statusText: string;
  acceptedCount: number;
}
interface LibrarySettings {
  library: { enabled: boolean; perDay: number; anchors: { exam: string; exam2: string; pilotStart: string } };
  proactive: { overnightPrep: boolean };
  notifications: { middayDigest: string };
}

const STATUS_LABEL: Record<Status, string> = {
  eligible: "Ready",
  pending: "In inbox",
  accepted: "Accepted",
  done_for_now: "Repeats",
  waiting: "Waiting",
  locked: "Locked",
  snoozed: "Not now",
  never: "Never",
};
const STATUS_CLASS: Record<Status, string> = {
  eligible: "running",
  pending: "awaiting_approval",
  accepted: "done",
  done_for_now: "done",
  waiting: "pending",
  locked: "pending",
  snoozed: "paused",
  never: "cancelled",
};

export function LibraryView({ initial, labels, settings }: { initial: { items: Item[]; stats: Record<string, { accepted: number; answered: number }> }; labels: Record<string, string>; settings: LibrarySettings }) {
  const [data, setData] = useState(initial);
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [s, setS] = useState(settings);

  const reload = async () => setData(await api("/api/library"));
  const act = async (body: Record<string, string>, msg: string) => {
    setBusy(body.id ?? body.action!);
    try {
      const r = await api<{ picked?: { title: string }[] }>("/api/library", { body });
      toast(body.action === "run" ? (r.picked?.length ? `${r.picked.length} new suggestion${r.picked.length === 1 ? "" : "s"} in your inbox.` : "Nothing new: today's limit is reached or nothing is due.") : msg);
      await reload();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(null);
    }
  };
  const save = async (patch: Partial<LibrarySettings> & Record<string, unknown>) => {
    try {
      const r = await api<{ settings: LibrarySettings }>("/api/settings", { method: "PUT", body: patch });
      setS(r.settings);
      toast("Saved.");
      await reload();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    }
  };

  const shown = useMemo(() => {
    const lower = q.toLowerCase();
    return data.items.filter((i) => (!domain || i.domain === domain) && (!status || i.status === status) && (!lower || i.title.toLowerCase().includes(lower) || i.id.toLowerCase() === lower));
  }, [data, domain, status, q]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of data.items) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [data]);
  const [anchors, setAnchors] = useState(s.library.anchors);

  return (
    <div className="cards">
      <section className="card span-12" aria-labelledby="h-how">
        <div className="card-head"><h3 id="h-how">How Maverick suggests</h3><span className={`st ${s.library.enabled ? "done" : "paused"}`}>{s.library.enabled ? "On" : "Off"}</span></div>
        <p className="small muted" style={{ marginTop: 0 }}>
          Each morning, 30 minutes before your briefing, Maverick checks which of these tasks are due (a date, your data, a step you unlocked) and puts the best {s.library.perDay} in your inbox: at most one per area, nothing big on a long shift day. &quot;Not now&quot; brings a task back in 14 days; &quot;Never&quot; stops it.
        </p>
        <div className="form-grid">
          <label className="check" style={{ marginTop: 22 }}><input type="checkbox" checked={s.library.enabled} onChange={(e) => save({ library: { ...s.library, enabled: e.target.checked } })} /> Daily suggestions</label>
          <div>
            <label htmlFor="perday">Suggestions per day</label>
            <select id="perday" value={s.library.perDay} onChange={(e) => save({ library: { ...s.library, perDay: Number(e.target.value) } })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <label className="check" style={{ marginTop: 22 }}><input type="checkbox" checked={s.proactive.overnightPrep} onChange={(e) => save({ proactive: { overnightPrep: e.target.checked } })} /> Overnight preparation (1 h before the briefing)</label>
          <div>
            <label htmlFor="digest">Midday digest</label>
            <input id="digest" type="time" value={s.notifications.middayDigest} onChange={(e) => save({ notifications: { middayDigest: e.target.value } })} />
          </div>
        </div>
        <form
          className="form-grid"
          style={{ marginTop: "0.8rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            void save({ library: { ...s.library, anchors } });
          }}
        >
          <div><label htmlFor="a-exam">Next exam</label><input id="a-exam" type="date" value={anchors.exam} onChange={(e) => setAnchors({ ...anchors, exam: e.target.value })} /></div>
          <div><label htmlFor="a-exam2">The exam after that</label><input id="a-exam2" type="date" value={anchors.exam2} onChange={(e) => setAnchors({ ...anchors, exam2: e.target.value })} /></div>
          <div><label htmlFor="a-pilot">Pilot school start</label><input id="a-pilot" type="date" value={anchors.pilotStart} onChange={(e) => setAnchors({ ...anchors, pilotStart: e.target.value })} /></div>
          <div style={{ alignSelf: "end" }}><button className="btn">Save dates</button></div>
        </form>
        <p className="hint">The exam and pilot tasks are timed from these dates. Leave one empty if it isn&apos;t known yet.</p>
        <div className="row" style={{ marginTop: "0.6rem" }}>
          <button className="btn btn-primary" disabled={busy === "run"} onClick={() => act({ action: "run" }, "")}>Suggest today&apos;s tasks now</button>
          <span className="small faint">{counts.eligible ?? 0} ready today · {counts.pending ?? 0} in inbox · {counts.accepted ?? 0} accepted · {counts.never ?? 0} never</span>
        </div>
      </section>

      <section className="card span-12" aria-labelledby="h-areas">
        <div className="card-head"><h3 id="h-areas">What you accept, by area</h3><span className="tele">this teaches Maverick what to suggest more of</span></div>
        <div className="telemetry">
          {Object.entries(labels).map(([k, label]) => {
            const st = data.stats[k] ?? { accepted: 0, answered: 0 };
            return (
              <div key={k}>
                <span className="tele">{label}</span>
                <div className="v">{st.answered ? `${Math.round((st.accepted / st.answered) * 100)}%` : "—"}</div>
                <span className="small faint">{st.answered ? `${st.accepted} of ${st.answered} answered` : "nothing answered yet"}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card span-12" aria-labelledby="h-all">
        <div className="card-head"><h3 id="h-all">All {data.items.length} tasks</h3></div>
        <div className="toolbar">
          <input aria-label="Search tasks" placeholder="Search, or a task id like Z14" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Area" value={domain} onChange={(e) => setDomain(e.target.value)}>
            <option value="">All areas</option>
            {Object.entries(labels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]} ({counts[k] ?? 0})</option>)}
          </select>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>#</th><th>Task</th><th>When</th><th>Effort</th><th>Status</th><th /></tr></thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td className="mono small">{i.id}</td>
                  <td>
                    {i.title}
                    <div className="small faint">{i.why} · {labels[i.domain]}</div>
                  </td>
                  <td className="small">{i.when}</td>
                  <td className="mono small">{i.effort}</td>
                  <td><span className={`st ${STATUS_CLASS[i.status]}`} title={i.statusText}>{STATUS_LABEL[i.status]}</span><div className="small faint" style={{ marginTop: 3 }}>{i.statusText}</div></td>
                  <td>
                    {i.status === "never" || i.status === "snoozed" ? (
                      <button className="btn btn-sm" disabled={busy === i.id} onClick={() => act({ action: "restore", id: i.id }, "Restored. It can be suggested again.")}>Restore</button>
                    ) : i.status !== "pending" ? (
                      <button className="btn btn-sm btn-ghost" disabled={busy === i.id} onClick={() => act({ action: "suggest", id: i.id }, "Added to your inbox.")}>Suggest now</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <p className="empty">No tasks match.</p>}
        </div>
      </section>
    </div>
  );
}
