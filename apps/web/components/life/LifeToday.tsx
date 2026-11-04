"use client";

import Link from "next/link";
import { useState } from "react";
import type { Habit, LifeOverview } from "@maverick/core";
import { AREA_LABEL, LIFE_AREAS, addDays, isoWeekday, scheduledOn, versionOn } from "@maverick/core/life/score";
import { api } from "@/lib/client";
import { Bar, Ring, Spark, STATUS_LABEL, TallyLine, fmtDate } from "./shared";

export function LifeToday({ initial }: { initial: LifeOverview }) {
  const [o, setO] = useState(initial);
  const [menu, setMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = o.today;

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      setO((await api<{ overview: LifeOverview }>("/api/life")).overview);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setMenu(null);
    }
  };
  const log = (h: Habit, status: string | null) => run(() => api("/api/life/logs", { method: "PUT", body: { habitId: h.id, date: t, status } }));
  const flag = (f: "rest" | "sick" | null) => run(() => api("/api/life/days", { method: "PUT", body: { date: t, flag: f } }));

  const byId = new Map(o.habits.map((h) => [h.id, h]));
  const dayHabits = o.day.rows.map((r) => ({ h: byId.get(r.habitId)!, status: r.status }));
  const weekly = o.week.habits.filter((w) => w.kinds.includes("weekly")).map((w) => ({ h: byId.get(w.habitId)!, w }));
  const live = o.habits.filter((h) => versionOn(h, t)?.status === "active");
  const dayFlag = o.book.flags[t];

  const open = dayHabits.filter((x) => x.status === "unlogged");
  const behind = weekly.filter((x) => x.w.short > 0);
  const daysLeft = 8 - isoWeekday(t);
  const wroteToday = o.recentEntries.some((e) => e.date === t);

  const upcoming = [1, 2, 3]
    .map((i) => addDays(t, i))
    .map((d) => ({ d, hs: live.filter((h) => scheduledOn(h, d)) }))
    .filter((u) => u.hs.length);

  const row = (h: Habit, kind: "days" | "weekly", status?: string, w?: (typeof weekly)[number]["w"]) => {
    const l = o.book.logs[h.id]?.[t];
    const done = l === "done";
    const key = `${h.id}-${kind}`;
    return (
      <li key={key} className={`habit-row${done ? " is-done" : ""}`}>
        <button className="habit-check" aria-pressed={done} disabled={busy} onClick={() => log(h, done ? null : "done")} aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${h.title}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4L18 8" /></svg>
        </button>
        <div className="habit-main">
          <div className="habit-title">{h.title}</div>
          <div className="habit-meta">
            {AREA_LABEL[h.area]}
            {h.minimum && <> · Minimum: {h.minimum}</>}
          </div>
        </div>
        {kind === "weekly" && w ? (
          <span className="badge">{Math.min(w.completions, w.target)} of {w.target} this week{w.extra ? ` (+${w.extra})` : ""}</span>
        ) : (
          status && status !== "unlogged" && !done && <span className={`badge ${status === "missed" ? "badge-danger" : "badge-warn"}`}>{l ? STATUS_LABEL[l] : dayFlag === "sick" ? "Ill" : "Rest day"}</span>
        )}
        <button className="btn btn-ghost btn-sm" aria-expanded={menu === key} aria-label={`More options for ${h.title}`} onClick={() => setMenu(menu === key ? null : key)}>
          ⋯
        </button>
        {menu === key && (
          <div className="habit-menu">
            {kind === "days" && <button className="btn btn-sm" onClick={() => log(h, "missed")}>Missed</button>}
            <button className="btn btn-sm" onClick={() => log(h, "rest")}>{kind === "weekly" ? "Excuse one this week" : "Planned rest"}</button>
            {kind === "days" && <button className="btn btn-sm" onClick={() => log(h, "sick")}>Ill</button>}
            <button className="btn btn-sm btn-ghost" onClick={() => log(h, null)}>Clear</button>
          </div>
        )}
      </li>
    );
  };

  if (!o.habits.length) {
    return (
      <section className="card">
        <h2>No habits yet</h2>
        <p className="muted">Add a few habits to start tracking, or bring over your Daybook data. Start with two or three; you can add more later.</p>
        <div className="row">
          <Link className="btn btn-primary" href="/life/habits?new=1">Add a habit</Link>
          <Link className="btn" href="/life/habits#import">Import from Daybook</Link>
          <Link className="btn btn-ghost" href="/life/journal">Write in the journal</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="cards">
      {error && <div className="alert alert-error span-12" role="alert">{error}</div>}

      <section className="card span-8" aria-labelledby="h-today">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 id="h-today">Today</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {o.day.scheduled ? <TallyLine t={o.day} /> : o.day.excused ? `${o.day.excused} excused today` : "No day-habits scheduled today"}
            </p>
          </div>
          <Ring pct={o.day.scheduled ? o.day.pct : null} />
        </div>
        {dayHabits.length > 0 && <ul className="habit-list">{dayHabits.map((x) => row(x.h, "days", x.status))}</ul>}
        {weekly.length > 0 && (
          <>
            <h3 style={{ marginTop: "1rem" }}>Weekly targets</h3>
            <ul className="habit-list">{weekly.map((x) => row(x.h, "weekly", undefined, x.w))}</ul>
          </>
        )}
        <div className="day-flag">
          {dayFlag ? (
            <>
              <span className="muted small">Today is marked as {dayFlag === "sick" ? "an illness day" : "a planned rest day"}; day-habits are excused.</span>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => flag(null)}>Undo</button>
            </>
          ) : (
            <>
              <span className="muted small">Not a normal day?</span>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => flag("rest")}>Mark as rest day</button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => flag("sick")}>Mark as ill</button>
            </>
          )}
        </div>
      </section>

      <section className="card span-4 next-card" aria-labelledby="h-next">
        <h3 id="h-next">Next action</h3>
        {open.length ? (
          <>
            <p className="next-big">{open[0]!.h.title}</p>
            <p className="muted small">{open[0]!.h.minimum ? `If the day is tight, the minimum counts: ${open[0]!.h.minimum}.` : "Scheduled today and not logged yet."}</p>
          </>
        ) : behind.length ? (
          <>
            <p className="next-big">{behind[0]!.h.title}</p>
            <p className="muted small">
              {behind[0]!.w.short} to go with {daysLeft} day{daysLeft === 1 ? "" : "s"} left this week.{behind[0]!.h.minimum ? ` Minimum: ${behind[0]!.h.minimum}.` : ""}
            </p>
          </>
        ) : !wroteToday ? (
          <>
            <p className="next-big">Write a few lines about today</p>
            <p className="muted small">Habits are logged. A short entry gives your evening check-in and weekly review something real to work with.</p>
            <Link className="btn btn-sm" href="/life/journal?new=1">Open today&apos;s entry</Link>
          </>
        ) : (
          <>
            <p className="next-big">Done for today</p>
            <p className="muted small">Everything scheduled is logged and today&apos;s entry is written. Rest counts too.</p>
          </>
        )}
      </section>

      <section className="card span-4" aria-labelledby="h-week">
        <h3 id="h-week">This week so far</h3>
        <div className="big-num">{o.week.total.scheduled ? `${o.week.total.pct}%` : <span className="faint small">No habits scheduled</span>}</div>
        {o.week.total.scheduled > 0 && <Bar pct={o.week.total.pct} />}
        <p className="small muted" style={{ marginTop: "0.5rem" }}><TallyLine t={o.week.total} week="current" /></p>
        <p className="small" style={{ marginBottom: 0 }}>
          Last week, final:{" "}
          {o.lastWeek.total.scheduled ? <strong>{o.lastWeek.total.pct}% ({o.lastWeek.total.done} of {o.lastWeek.total.scheduled})</strong> : <span className="faint">nothing scheduled</span>}
        </p>
        <details className="how">
          <summary>How these numbers work</summary>
          <p>Daily: day-habits completed ÷ day-habits scheduled today. Weekly: completed occurrences ÷ scheduled occurrences. &ldquo;N× per week&rdquo; targets count up to the target, never above it. &ldquo;So far&rdquo; counts day-habits through today and weekly targets in full. Rest and illness leave the count. Not logged stays separate from missed.</p>
          <p>These figures measure habit completion, not you.</p>
        </details>
      </section>

      <section className="card span-4" aria-labelledby="h-area">
        <h3 id="h-area">By life area</h3>
        {Object.keys(o.week.byArea).length ? (
          <ul className="area-list">
            {LIFE_AREAS.filter((a) => o.week.byArea[a]).map((a) => {
              const x = o.week.byArea[a]!;
              return (
                <li key={a}>
                  <span className="area-name">{AREA_LABEL[a]}</span>
                  <Bar pct={x.pct} />
                  <span className="num small">{x.scheduled ? `${x.done}/${x.scheduled}` : "–"}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">Nothing scheduled this week.</p>
        )}
      </section>

      <section className="card span-4" aria-labelledby="h-up">
        <h3 id="h-up">Coming up</h3>
        {upcoming.length ? (
          <ul className="list-plain small">
            {upcoming.map((u) => (
              <li key={u.d}>
                <span className="item"><strong>{fmtDate(u.d, { weekday: "long" })}</strong> · {u.hs.map((h) => h.title).join(", ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No day-habits in the next three days.</p>
        )}
        {behind.length > 0 && (
          <p className="small muted" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
            Open weekly targets: {behind.map((x) => `${x.h.title} (${x.w.short} to go)`).join(", ")}
          </p>
        )}
      </section>

      <section className="card span-8" aria-labelledby="h-trend">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 id="h-trend" style={{ margin: 0 }}>Mood and energy</h3>
          <span className="faint small">Last 14 days · 1 to 5 · kept apart from habit scores</span>
        </div>
        <div className="spark-row">
          <Spark label="Mood" points={o.trend.map((p) => ({ date: p.date, v: p.mood }))} />
          <Spark label="Energy" points={o.trend.map((p) => ({ date: p.date, v: p.energy }))} />
        </div>
      </section>

      <section className="card span-4" aria-labelledby="h-recent">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 id="h-recent" style={{ margin: 0 }}>Recent entries</h3>
          <Link className="small" href="/life/journal">All</Link>
        </div>
        {o.recentEntries.length ? (
          <ul className="list-plain">
            {o.recentEntries.map((e) => (
              <li key={e.id}>
                <Link href={`/life/journal?entry=${e.id}`}>
                  <span className="faint small">{fmtDate(e.date)}</span>
                  <span className="entry-snippet">{(e.body || Object.values(e.prompts).join(" ")).slice(0, 120) || "Ratings only"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No entries yet. <Link href="/life/journal?new=1">Write today&apos;s</Link>.</p>
        )}
      </section>
    </div>
  );
}
