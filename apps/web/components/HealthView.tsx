"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { ColumnChart } from "./viz";

type Kind = "workout" | "sleep" | "weight" | "energy";
interface Entry { id: string; date: string; kind: Kind; value: number; note: string | null }
interface Week { workouts: number; workoutMin: number; avgSleep: number | null; avgEnergy: number | null }
interface Trends {
  hasData: boolean;
  days: { date: string; workoutMin: number; sleepH: number | null; weightKg: number | null; energy: number | null }[];
  week: Week;
  prevWeek: Week;
  weight: { latest: number | null; change30: number | null };
  workoutStreakWeeks: number;
  insights: { kind: "warning" | "win" | "tip"; text: string }[];
}

const KINDS: Record<Kind, { label: string; unit: string; placeholder: string; step: string }> = {
  workout: { label: "Workout", unit: "min", placeholder: "Minutes, e.g. 60", step: "1" },
  sleep: { label: "Sleep", unit: "h", placeholder: "Hours, e.g. 7,5", step: "0.25" },
  weight: { label: "Weight", unit: "kg", placeholder: "kg, e.g. 78,4", step: "0.1" },
  energy: { label: "Energy", unit: "/5", placeholder: "1 (drained) – 5 (sharp)", step: "1" },
};

const fmt = (v: number | null, unit: string) => (v === null ? "—" : `${v}${unit === "/5" ? "/5" : ` ${unit}`}`);
function delta(a: number | null, b: number | null, unit: string) {
  if (a === null || b === null) return "";
  const d = Math.round((a - b) * 10) / 10;
  return d === 0 ? " · same as last week" : ` · ${d > 0 ? "+" : ""}${d} ${unit} vs last week`;
}

export function HealthView({ initial }: { initial: { trends: Trends; entries: Entry[]; today: string } }) {
  const [d, setD] = useState(initial);
  const [kind, setKind] = useState<Kind>("workout");
  const [form, setForm] = useState({ date: initial.today, value: "", note: "" });
  const [busy, setBusy] = useState(false);
  const t = d.trends;

  const reload = async () => setD(await api("/api/health-log"));
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/health-log", { body: { date: form.date, kind, value: form.value, note: form.note } });
      setForm({ ...form, value: "", note: "" });
      toast(`${KINDS[kind].label} logged.`);
      await reload();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try {
      await api(`/api/health-log/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    }
  };
  const last14 = t.days.slice(-14);

  return (
    <div className="cards">
      <section className="card span-12" aria-labelledby="h-log">
        <div className="card-head"><h3 id="h-log">Log</h3><span className="tele">takes 10 seconds</span></div>
        <div className="seg" role="group" aria-label="What to log" style={{ marginBottom: "0.7rem" }}>
          {(Object.keys(KINDS) as Kind[]).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{KINDS[k].label}</button>)}
        </div>
        <form className="form-grid" onSubmit={add}>
          <input aria-label="Date" type="date" value={form.date} max={d.today} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <input aria-label={`${KINDS[kind].label} (${KINDS[kind].unit})`} inputMode="decimal" placeholder={KINDS[kind].placeholder} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
          <input aria-label="Note" placeholder={kind === "workout" ? "Type, e.g. Push day, 5 km run" : "Note (optional)"} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button className="btn btn-primary" disabled={busy}>Log {KINDS[kind].label.toLowerCase()}</button>
        </form>
        <p className="hint">No wearable is connected. Everything here comes from what you log.</p>
      </section>

      {!t.hasData ? (
        <section className="card span-12 empty-state"><span className="tele">No health data</span>Log a workout, a night's sleep, your weight or your energy, and trends appear here.</section>
      ) : (
        <>
          <section className="card span-12" aria-labelledby="h-week">
            <div className="card-head"><h3 id="h-week">Last 7 days</h3><span className="tele">vs the 7 days before</span></div>
            <div className="telemetry">
              <div><span className="tele">Workouts</span><div className="v">{t.week.workouts} <span className="small faint">({t.week.workoutMin} min)</span></div><span className="small faint">{t.prevWeek.workouts} the week before · target 5</span></div>
              <div><span className="tele">Avg sleep</span><div className="v">{fmt(t.week.avgSleep, "h")}</div><span className="small faint">{delta(t.week.avgSleep, t.prevWeek.avgSleep, "h").replace(" · ", "") || " "}</span></div>
              <div><span className="tele">Avg energy</span><div className="v">{fmt(t.week.avgEnergy, "/5")}</div><span className="small faint">{delta(t.week.avgEnergy, t.prevWeek.avgEnergy, "").replace(" · ", "") || " "}</span></div>
              <div><span className="tele">Weight</span><div className="v">{fmt(t.weight.latest, "kg")}</div><span className="small faint">{t.weight.change30 !== null ? `${t.weight.change30 > 0 ? "+" : ""}${t.weight.change30} kg over ~30 days` : " "}</span></div>
              <div><span className="tele">Training streak</span><div className="v">{t.workoutStreakWeeks} wk</div><span className="small faint">weeks with 3+ workouts</span></div>
            </div>
            {t.insights.length > 0 && (
              <ul className="insights" style={{ marginTop: "0.9rem" }}>
                {t.insights.map((x, n) => <li key={n} className={`insight ${x.kind}`}><span className="ico" aria-hidden>{x.kind === "warning" ? "!" : x.kind === "win" ? "✓" : "i"}</span><p><span className="kind">{x.kind}</span>{x.text}</p><span /></li>)}
              </ul>
            )}
          </section>
          <section className="card span-6" aria-labelledby="h-wo">
            <div className="card-head"><h3 id="h-wo">Workout minutes per day</h3><span className="tele">14 days</span></div>
            <ColumnChart data={last14.map((x) => ({ date: x.date, value: x.workoutMin }))} unit="minutes" height={140} />
          </section>
          <section className="card span-6" aria-labelledby="h-sl">
            <div className="card-head"><h3 id="h-sl">Sleep per night</h3><span className="tele">14 days · gaps = not logged</span></div>
            <ColumnChart data={last14.map((x) => ({ date: x.date, value: x.sleepH ?? 0 }))} unit="hours" valueFormat="dec" height={140} />
          </section>
        </>
      )}

      <section className="card span-12" aria-labelledby="h-entries">
        <div className="card-head"><h3 id="h-entries">Entries</h3><span className="tele">{d.entries.length} recent</span></div>
        {d.entries.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Date</th><th>What</th><th className="num">Value</th><th>Note</th><th /></tr></thead>
              <tbody>
                {d.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="mono small">{e.date}</td>
                    <td>{KINDS[e.kind].label}</td>
                    <td className="num mono">{fmt(e.value, KINDS[e.kind].unit)}</td>
                    <td className="small muted" style={{ overflowWrap: "anywhere" }}>{e.note}</td>
                    <td><button className="btn btn-sm btn-ghost" aria-label="Delete entry" onClick={() => window.confirm("Delete this entry?") && void remove(e.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">Nothing logged yet.</p>}
      </section>
    </div>
  );
}
