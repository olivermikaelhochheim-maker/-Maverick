"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { kickLive } from "@/lib/live";
import type { UiTemplate } from "./Missions";

interface Automation {
  id: string;
  template: string;
  params: Record<string, string>;
  title: string;
  cadence: "daily" | "weekdays" | "weekly";
  time: string;
  weekday: number | null;
  enabled: boolean;
  lastRunDate: string | null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function AutomationsView({ initial, templates }: { initial: Automation[]; templates: UiTemplate[] }) {
  const [list, setList] = useState(initial);
  const [template, setTemplate] = useState("prepare_tomorrow");
  const [cadence, setCadence] = useState<Automation["cadence"]>("daily");
  const [time, setTime] = useState("20:00");
  const [weekday, setWeekday] = useState(0);
  const [params, setParams] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const t = templates.find((x) => x.id === template);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ automation: Automation }>("/api/automations", { body: { template, params, cadence, time, weekday } });
      setList([...list, r.automation]);
      toast(`Scheduled: ${r.automation.title}`);
      kickLive();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (a: Automation) => {
    try {
      const r = await api<{ automation: Automation }>(`/api/automations/${a.id}`, { method: "PATCH", body: { enabled: !a.enabled } });
      setList(list.map((x) => (x.id === a.id ? r.automation : x)));
      kickLive();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    }
  };
  const remove = async (a: Automation) => {
    if (!window.confirm(`Delete the automation "${a.title}"?`)) return;
    try {
      await api(`/api/automations/${a.id}`, { method: "DELETE" });
      setList(list.filter((x) => x.id !== a.id));
      kickLive();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    }
  };

  return (
    <div className="cards">
      <section className="card span-12" aria-labelledby="h-list">
        <div className="card-head"><h3 id="h-list">Scheduled</h3><span className="tele">{list.filter((a) => a.enabled).length} on · checked every minute by the server</span></div>
        {list.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Mission</th><th>When</th><th>Last run</th><th>State</th><th /></tr></thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.title}</strong></td>
                    <td className="mono small">{a.cadence === "weekly" ? DAYS[a.weekday ?? 0] : a.cadence === "weekdays" ? "Mon–Fri" : "Every day"} {a.time}</td>
                    <td className="mono small">{a.lastRunDate ?? "never"}</td>
                    <td><button className="btn btn-sm" onClick={() => toggle(a)} aria-pressed={a.enabled}>{a.enabled ? "On" : "Off"}</button></td>
                    <td><button className="btn btn-sm btn-ghost" onClick={() => remove(a)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No automations yet. Nothing runs on a schedule except your briefings and reminders.</p>
        )}
        <p className="hint">Each run launches a normal mission: your autonomy mode and tool permissions decide what it may do, and anything needing approval waits for you. Missed runs catch up for 3 hours (e.g. if the Mac was asleep). The emergency stop pauses all automations.</p>
      </section>
      <section className="card span-12" aria-labelledby="h-new">
        <div className="card-head"><h3 id="h-new">New automation</h3></div>
        <form onSubmit={create}>
          <div className="form-grid">
            <div>
              <label htmlFor="a-t">Mission</label>
              <select id="a-t" value={template} onChange={(e) => setTemplate(e.target.value)}>
                {templates.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="a-c">Repeat</label>
              <select id="a-c" value={cadence} onChange={(e) => setCadence(e.target.value as Automation["cadence"])}>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Once a week</option>
              </select>
            </div>
            {cadence === "weekly" && (
              <div>
                <label htmlFor="a-d">Day</label>
                <select id="a-d" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="a-time">Time</label>
              <input id="a-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
          </div>
          {t?.params.map((p) => (
            <div className="field" key={p.key} style={{ marginTop: "0.6rem" }}>
              <label htmlFor={`ap-${p.key}`}>{p.label}</label>
              <input id={`ap-${p.key}`} value={params[p.key] ?? ""} placeholder={p.placeholder} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })} />
            </div>
          ))}
          <p className="small muted" style={{ margin: "0.6rem 0" }}>{t?.description}</p>
          <button className="btn btn-primary" disabled={busy}>Schedule</button>
        </form>
      </section>
    </div>
  );
}
