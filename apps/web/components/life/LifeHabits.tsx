"use client";

import { useEffect, useState } from "react";
import type { Goal, Habit, LogBook, WeekScore } from "@maverick/core";
import { AREA_LABEL, LIFE_AREAS, addDays, describeSchedule, isoWeekNumber, isoWeekday, mondayOf, scheduledOn, versionOn, weekDates } from "@maverick/core/life/score";
import { api } from "@/lib/client";
import { Bar, TallyLine, fmtDate } from "./shared";

type Week = { habits: Habit[]; book: LogBook; score: WeekScore };
type History = { weeks: WeekScore[]; byWeekday: { scheduled: number; done: number }[] };
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CYCLE: Record<string, string | null> = { "": "done", done: "missed", missed: "rest", rest: "sick", sick: null };
const MARK: Record<string, string> = { done: "✓", missed: "×", rest: "R", sick: "I", excused: "–" };

interface Form {
  id?: string;
  title: string;
  area: string;
  kind: "days" | "weekly";
  days: number[];
  target: number;
  minimum: string;
  why: string;
  goalId: string;
  remindTime: string;
  from: string;
}

export function LifeHabits({ initial, history: initialHistory, goals, today, startNew }: { initial: Week; history: History; goals: Goal[]; today: string; startNew?: boolean }) {
  const [week, setWeek] = useState(initial);
  const [monday, setMonday] = useState(initial.score.monday);
  const [history, setHistory] = useState(initialHistory);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showImport] = useState(initial.habits.length === 0);
  const thisMonday = mondayOf(today);

  const blank = (): Form => ({ title: "", area: "fitness", kind: "days", days: [1, 2, 3, 4, 5, 6, 7], target: 3, minimum: "", why: "", goalId: "", remindTime: "", from: today });
  useEffect(() => {
    if (startNew) setForm(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = async (m = monday) => {
    const [w, h] = await Promise.all([api<Week>(`/api/life/week?monday=${m}`), api<{ history: History }>("/api/life/history")]);
    setWeek(w);
    setHistory(h.history);
  };
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      after?.();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const goWeek = async (m: string) => {
    setMonday(m);
    setError(null);
    try {
      setWeek(await api<Week>(`/api/life/week?monday=${m}`));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const days = weekDates(monday);
  const s = week.score;
  const visible = week.habits.filter((h) => s.habits.some((r) => r.habitId === h.id) || days.some((d) => versionOn(h, d)?.status === "active"));
  const groups = { active: [] as Habit[], paused: [] as Habit[], archived: [] as Habit[] };
  for (const h of week.habits) groups[(versionOn(h, today) ?? h.versions[0])?.status ?? "active"].push(h);

  const edit = (h: Habit) => {
    const v = versionOn(h, today) ?? h.versions[h.versions.length - 1]!;
    setForm({ id: h.id, title: h.title, area: h.area, kind: v.kind, days: v.days.length ? v.days : [1, 2, 3, 4, 5, 6, 7], target: v.target || 3, minimum: h.minimum ?? "", why: h.why ?? "", goalId: h.goalId ?? "", remindTime: h.remindTime ?? "", from: today });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const details = { title: form.title, area: form.area, minimum: form.minimum || null, why: form.why || null, goalId: form.goalId || null, remindTime: form.remindTime || null };
    const sched = { kind: form.kind, days: form.days, target: form.target };
    void run(
      () =>
        form.id
          ? api(`/api/life/habits/${form.id}`, { method: "PATCH", body: { ...details, schedule: { ...sched, from: form.from } } })
          : api("/api/life/habits", { body: { ...details, ...sched, from: form.from } }),
      () => setForm(null),
    );
  };

  const formHtml = form && (
    <form className="card habit-form" onSubmit={submit}>
      <h2>{form.id ? "Edit habit" : "New habit"}</h2>
      <div className="field">
        <label htmlFor="hf-title">Action</label>
        <input id="hf-title" required maxLength={200} autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Walk 20 minutes after work" />
      </div>
      <div className="form-grid">
        <div>
          <label htmlFor="hf-area">Life area</label>
          <select id="hf-area" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
            {LIFE_AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="hf-goal">Connected goal</label>
          <select id="hf-goal" value={form.goalId} onChange={(e) => setForm({ ...form, goalId: e.target.value })}>
            <option value="">None</option>
            {goals.filter((g) => g.status === "active" || g.id === form.goalId).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="hf-remind">Reminder (optional)</label>
          <input id="hf-remind" type="time" value={form.remindTime} onChange={(e) => setForm({ ...form, remindTime: e.target.value })} />
        </div>
      </div>
      <div className="field" style={{ marginTop: "0.8rem" }}>
        <span className="label-like">Schedule</span>
        <div className="segmented" role="group" aria-label="Schedule type">
          <button type="button" className={form.kind === "days" ? "on" : ""} onClick={() => setForm({ ...form, kind: "days" })}>Specific days</button>
          <button type="button" className={form.kind === "weekly" ? "on" : ""} onClick={() => setForm({ ...form, kind: "weekly" })}>Times per week</button>
        </div>
        {form.kind === "days" ? (
          <div className="day-picker">
            {DOW.map((d, i) => {
              const on = form.days.includes(i + 1);
              return (
                <button type="button" key={d} aria-pressed={on} className={on ? "on" : ""} onClick={() => setForm({ ...form, days: on ? form.days.filter((x) => x !== i + 1) : [...form.days, i + 1].sort() })}>
                  {d}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="row" style={{ marginTop: "0.6rem" }}>
            <button type="button" className="btn btn-sm" aria-label="Fewer" onClick={() => setForm({ ...form, target: Math.max(1, form.target - 1) })}>−</button>
            <strong className="num" style={{ fontSize: "1.3rem" }}>{form.target}</strong>
            <span className="muted">times per week</span>
            <button type="button" className="btn btn-sm" aria-label="More" onClick={() => setForm({ ...form, target: Math.min(7, form.target + 1) })}>+</button>
          </div>
        )}
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="hf-min">Minimum version, for bad days</label>
          <input id="hf-min" maxLength={300} value={form.minimum} onChange={(e) => setForm({ ...form, minimum: e.target.value })} placeholder="The smallest version that still counts" />
        </div>
        <div className="field">
          <label htmlFor="hf-from">{form.id ? "Schedule change applies from" : "Start on"}</label>
          <input id="hf-from" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          {form.id && <p className="hint">Earlier weeks keep their old schedule and scores.</p>}
        </div>
      </div>
      <div className="field">
        <label htmlFor="hf-why">Why (optional)</label>
        <input id="hf-why" maxLength={1000} value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} />
      </div>
      {form.remindTime && form.remindTime >= "22:00" && <p className="hint">Reminders inside your quiet hours are held, so this one may not arrive that day.</p>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{form.id ? "Save changes" : "Add habit"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
      </div>
    </form>
  );

  const card = (h: Habit) => {
    const v = versionOn(h, today) ?? h.versions[0]!;
    const future = h.versions.find((x) => x.validFrom > today);
    const goal = goals.find((g) => g.id === h.goalId);
    if (form?.id === h.id) return <div key={h.id}>{formHtml}</div>;
    return (
      <section className="card habit-card" key={h.id}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="badge badge-accent">{AREA_LABEL[h.area]}</span>
          <span className="faint small">{describeSchedule(v)}{h.remindTime ? ` · ${h.remindTime}` : ""}</span>
        </div>
        <h2 style={{ margin: "0.6rem 0 0.3rem" }}>{h.title}</h2>
        <dl className="habit-dl">
          <dt>Minimum</dt><dd>{h.minimum ?? "–"}</dd>
          {goal && (<><dt>Goal</dt><dd>{goal.title}</dd></>)}
          {h.why && (<><dt>Why</dt><dd>{h.why}</dd></>)}
          {future && (<><dt>Scheduled change</dt><dd>{describeSchedule(future)} from {fmtDate(future.validFrom)}</dd></>)}
        </dl>
        <div className="row" style={{ gap: "0.3rem" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => edit(h)}>Edit</button>
          {v.status === "active" ? (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api(`/api/life/habits/${h.id}`, { method: "PATCH", body: { status: { value: "paused", from: today } } }))}>Pause</button>
          ) : (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api(`/api/life/habits/${h.id}`, { method: "PATCH", body: { status: { value: "active", from: today } } }))}>Resume</button>
          )}
          {v.status !== "archived" && (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api(`/api/life/habits/${h.id}`, { method: "PATCH", body: { status: { value: "archived", from: today } } }))}>Archive</button>
          )}
          {confirmDelete === h.id ? (
            <>
              <button className="btn btn-danger btn-sm" onClick={() => run(() => api(`/api/life/habits/${h.id}`, { method: "DELETE" }), () => setConfirmDelete(null))}>Delete with history</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(h.id)}>Delete</button>
          )}
        </div>
      </section>
    );
  };

  return (
    <div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0 }}>Week {isoWeekNumber(monday)} · {s.status === "final" ? "final result" : "so far"}</h2>
            <p className="faint small" style={{ margin: 0 }}>{fmtDate(monday, { day: "numeric", month: "short" })} to {fmtDate(days[6]!, { day: "numeric", month: "short" })}</p>
          </div>
          <div className="row" style={{ gap: "0.3rem" }}>
            <button className="btn btn-ghost btn-sm" aria-label="Previous week" onClick={() => goWeek(addDays(monday, -7))}>←</button>
            <button className="btn btn-ghost btn-sm" disabled={monday === thisMonday} onClick={() => goWeek(thisMonday)}>This week</button>
            <button className="btn btn-ghost btn-sm" aria-label="Next week" disabled={monday >= thisMonday} onClick={() => goWeek(addDays(monday, 7))}>→</button>
          </div>
        </div>
        <div className="row" style={{ margin: "0.8rem 0 0.2rem", alignItems: "baseline" }}>
          <span className="big-num">{s.total.scheduled ? `${s.total.pct}%` : "–"}</span>
          <span className="muted small"><TallyLine t={s.total} week={s.status} /></span>
        </div>
        {visible.length ? (
          <>
            <div className="table-wrap">
              <table className="week-grid">
                <thead>
                  <tr>
                    <th>Habit</th>
                    {days.map((d) => {
                      const f = week.book.flags[d];
                      return (
                        <th key={d}>
                          <button
                            className={`day-head${d === today ? " today" : ""}`}
                            disabled={d > today || busy}
                            title="Mark the whole day as rest or illness"
                            onClick={() => run(() => api("/api/life/days", { method: "PUT", body: { date: d, flag: { "": "rest", rest: "sick", sick: null }[f ?? ""] } }))}
                          >
                            {DOW[isoWeekday(d) - 1]}
                            <span>{Number(d.slice(8))}</span>
                            {f && <em>{f === "sick" ? "Ill" : "Rest"}</em>}
                          </button>
                        </th>
                      );
                    })}
                    <th className="num">Week</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((h) => {
                    const r = s.habits.find((x) => x.habitId === h.id);
                    const vEnd = versionOn(h, days[6]!);
                    const weekly = vEnd?.kind === "weekly" && vEnd.status === "active";
                    return (
                      <tr key={h.id}>
                        <th scope="row">
                          {h.title}
                          <span className="faint small">{describeSchedule(weekly ? vEnd : (versionOn(h, days[0]!) ?? vEnd))}</span>
                        </th>
                        {days.map((d) => {
                          const due = weekly || scheduledOn(h, d);
                          const l = week.book.logs[h.id]?.[d] ?? "";
                          const shown = due ? l || (week.book.flags[d] && !weekly ? "excused" : "") : "off";
                          return (
                            <td key={d}>
                              <button
                                className={`cell cell-${shown || "none"}`}
                                disabled={!due || d > today || busy}
                                aria-label={`${h.title}, ${fmtDate(d)}: ${due ? (l || "not logged") : "not scheduled"}`}
                                onClick={() => run(() => api("/api/life/logs", { method: "PUT", body: { habitId: h.id, date: d, status: CYCLE[l] } }))}
                              >
                                {MARK[shown] ?? ""}
                              </button>
                            </td>
                          );
                        })}
                        <td className="num small">{r ? `${r.done}/${r.scheduled}` : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="legend faint small">
              <span className="cell cell-done">✓</span> Done <span className="cell cell-missed">×</span> Missed <span className="cell cell-rest">R</span> Planned rest <span className="cell cell-sick">I</span> Ill <span className="cell cell-none" /> Not logged. Tap a cell to change it; tap a day to mark it as rest or illness.
            </p>
          </>
        ) : (
          <p className="empty">No habits were scheduled this week.</p>
        )}
      </section>

      <div className="row" style={{ justifyContent: "space-between", margin: "1.5rem 0 0.8rem" }}>
        <h2 style={{ margin: 0 }}>Your habits</h2>
        {!form && <button className="btn btn-primary btn-sm" onClick={() => setForm(blank())}>New habit</button>}
      </div>
      {form && !form.id && formHtml}
      <div className="habit-grid">{groups.active.map(card)}</div>
      {!groups.active.length && !form && <p className="empty">No active habits. Start with two or three you can keep on a bad week.</p>}
      {groups.paused.length > 0 && (
        <>
          <h3 style={{ marginTop: "1.2rem" }}>Paused</h3>
          <div className="habit-grid">{groups.paused.map(card)}</div>
        </>
      )}
      {groups.archived.length > 0 && (
        <details className="card" style={{ marginTop: "1rem" }}>
          <summary>Archived ({groups.archived.length})</summary>
          <div className="habit-grid" style={{ marginTop: "0.8rem" }}>{groups.archived.map(card)}</div>
          <p className="hint">Archived habits keep their history in past weeks.</p>
        </details>
      )}

      <div className="cards" style={{ marginTop: "1.5rem" }}>
        <section className="card span-8" aria-labelledby="h-hist">
          <h2 id="h-hist">Last 8 weeks</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Week</th><th className="num">Result</th><th className="num">Done</th><th className="num">Missed</th><th className="num">Not logged</th><th className="num">Short</th><th className="num">Excused</th>
                </tr>
              </thead>
              <tbody>
                {history.weeks.map((w) => (
                  <tr key={w.monday}>
                    <td>W{isoWeekNumber(w.monday)} {w.status === "current" && <span className="faint small">so far</span>}</td>
                    <td className="num">{w.total.scheduled ? `${w.total.pct}%` : "–"}</td>
                    <td className="num">{w.total.done}/{w.total.scheduled}</td>
                    <td className="num">{w.total.missed}</td>
                    <td className="num">{w.total.unlogged}</td>
                    <td className="num">{w.total.short}</td>
                    <td className="num">{w.total.excused}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card span-4" aria-labelledby="h-dow">
          <h2 id="h-dow">By weekday</h2>
          <p className="faint small">Day-habits, last 8 weeks</p>
          <ul className="area-list">
            {history.byWeekday.map((x, i) => (
              <li key={DOW[i]}>
                <span className="area-name">{DOW[i]}</span>
                <Bar pct={x.scheduled ? Math.round((x.done / x.scheduled) * 100) : null} />
                <span className="num small">{x.scheduled ? `${x.done}/${x.scheduled}` : "–"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {showImport && <DaybookImport onDone={() => void reload()} />}
    </div>
  );
}

/** Bring over a Daybook export (Settings → Export everything in Daybook). */
export function DaybookImport({ onDone }: { onDone?: () => void }) {
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card" id="import" style={{ marginTop: "1.5rem" }}>
      <h2>Import from Daybook</h2>
      <p className="muted small">
        In Daybook, open Settings and choose <strong>Export everything (JSON)</strong>. Choose that file here. Habits keep their schedule history and logs, journal entries keep their ratings and AI setting, and profile lines you stated or confirmed become memories. Works while Life is still empty.
      </p>
      <label className="btn btn-sm" style={{ cursor: busy ? "wait" : "pointer" }}>
        {busy ? "Importing…" : "Choose Daybook export…"}
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setStatus(null);
            try {
              const res = await fetch("/api/life/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Import failed.");
              const c = data.imported as Record<string, number>;
              setStatus({ kind: "ok", text: `Imported ${c.habits} habits, ${c.logs} log entries, ${c.journal} journal entries and ${c.profile} memories.` });
              onDone?.();
            } catch (err) {
              setStatus({ kind: "error", text: (err as Error).message });
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {status && <div className={`alert ${status.kind === "ok" ? "alert-ok" : "alert-error"}`} role="status" style={{ marginTop: "0.8rem" }}>{status.text}</div>}
    </section>
  );
}
