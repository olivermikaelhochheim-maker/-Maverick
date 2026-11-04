"use client";

import { useState } from "react";
import type { Goal, Task } from "@maverick/core";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { QuickAdd } from "./QuickAdd";
import { Meter } from "./viz";

const HORIZON_LABEL: Record<Goal["horizon"], string> = { "1y": "1 year", "3y": "3 years", "5y": "5 years", personal: "Personal", other: "Other" };

function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const fmtDue = (d: string, today: string) => {
  if (d === today) return "today";
  if (d === addDays(today, 1)) return "tomorrow";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

export function Planning({
  initialGoals,
  initialTasks,
  today,
  tz,
}: {
  initialGoals: Goal[];
  /** All tasks (open and finished): progress is computed from these. */
  initialTasks: Task[];
  today: string;
  tz: string;
}) {
  const [goals, setGoals] = useState(initialGoals);
  const [tasks, setTasks] = useState(initialTasks);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Goal progress straight from the task list, so it updates the moment a task changes.
  const prog = new Map<string, { done: number; total: number }>();
  for (const t of tasks) {
    if (!t.goalId || t.status === "dropped") continue;
    const p = prog.get(t.goalId) ?? { done: 0, total: 0 };
    p.total++;
    if (t.status === "done") p.done++;
    prog.set(t.goalId, p);
  }

  const run = async <T,>(fn: () => Promise<T>) => {
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError((err as Error).message);
      return undefined;
    }
  };
  const reloadTasks = async () => setTasks((await api<{ tasks: Task[] }>("/api/tasks?status=all")).tasks);

  const addTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const remind = String(f.get("remindAt") ?? "");
    const ok = await run(() =>
      api("/api/tasks", {
        body: {
          title: f.get("title"),
          priority: Number(f.get("priority")),
          dueDate: f.get("dueDate") || null,
          goalId: f.get("goalId") || null,
          remindAt: remind ? new Date(remind).toISOString() : null,
        },
      }),
    );
    if (ok) {
      form.reset();
      toast("Task added.");
      await reloadTasks();
    }
  };

  const patchTask = async (t: Task, patch: Record<string, unknown>) => {
    if (await run(() => api(`/api/tasks/${t.id}`, { method: "PATCH", body: patch }))) {
      if (patch.status === "done") toast({ text: `Done: ${t.title}. Nice.` });
      await reloadTasks();
    }
  };

  const addGoal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const res = await run(() =>
      api<{ goal: Goal }>("/api/goals", { body: { title: f.get("title"), horizon: f.get("horizon"), metric: f.get("metric") || null, targetDate: f.get("targetDate") || null } }),
    );
    if (res) {
      setGoals((g) => [...g, res.goal]);
      form.reset();
      toast("Goal added. Link tasks to it to track progress.");
    }
  };

  const setGoalStatus = async (g: Goal, status: Goal["status"]) => {
    const res = await run(() => api<{ goal: Goal }>(`/api/goals/${g.id}`, { method: "PATCH", body: { status } }));
    if (res) setGoals((gs) => gs.map((x) => (x.id === g.id ? res.goal : x)));
  };

  const removeGoal = async (g: Goal) => {
    if (!window.confirm(`Delete the goal "${g.title}"? Linked tasks stay, unlinked.`)) return;
    if (await run(() => api(`/api/goals/${g.id}`, { method: "DELETE" }))) setGoals((gs) => gs.filter((x) => x.id !== g.id));
  };

  const goalTitle = (id: string | null) => goals.find((g) => g.id === id)?.title;

  // ----- Grouping -----
  const week = addDays(today, 7);
  const open = tasks.filter((t) => t.status === "open");
  const groups: { key: string; label: string; cls?: string; items: Task[] }[] = [
    { key: "overdue", label: "Overdue", cls: "overdue", items: open.filter((t) => t.dueDate && t.dueDate < today) },
    { key: "today", label: "Today", cls: "today", items: open.filter((t) => t.dueDate === today) },
    { key: "week", label: "Next 7 days", items: open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= week) },
    { key: "later", label: "Later", items: open.filter((t) => t.dueDate && t.dueDate > week) },
    { key: "none", label: "No date", items: open.filter((t) => !t.dueDate) },
  ];
  if (showDone) groups.push({ key: "done", label: "Finished", items: tasks.filter((t) => t.status !== "open").slice(0, 50) });

  const taskRow = (t: Task) => (
    <li key={t.id}>
      <div className={`task-row${t.status !== "open" ? " done" : ""}`}>
        <input type="checkbox" aria-label={`Mark "${t.title}" done`} checked={t.status === "done"} onChange={() => patchTask(t, { status: t.status === "done" ? "open" : "done" })} />
        <span className={`prio prio-${t.priority}`} title={`Priority ${t.priority}`} />
        <span className="task-title">
          {t.title}
          <span className="hint" style={{ display: "block", marginTop: 0 }}>
            {[
              t.dueDate && (t.dueDate < today && t.status === "open" ? `overdue · ${fmtDue(t.dueDate, today)}` : fmtDue(t.dueDate, today)),
              t.remindAt && `⏰ ${new Date(t.remindAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz })}`,
              goalTitle(t.goalId) && `→ ${goalTitle(t.goalId)}`,
              t.source === "suggestion" && "suggested by Maverick",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        {t.status === "open" && t.dueDate && t.dueDate < today && (
          <button className="btn btn-sm btn-ghost" title="Move to today" onClick={() => patchTask(t, { dueDate: today })}>→ today</button>
        )}
        <button
          className="btn btn-sm btn-ghost"
          aria-label={`Delete "${t.title}"`}
          onClick={async () => {
            if (window.confirm(`Delete "${t.title}"?`) && (await run(() => api(`/api/tasks/${t.id}`, { method: "DELETE" })))) await reloadTasks();
          }}
        >
          ✕
        </button>
      </div>
    </li>
  );

  return (
    <div className="cards">
      {error && <div className="alert alert-error span-12" role="alert">{error}</div>}
      <section className="card span-7" aria-labelledby="h-tasks">
        <div className="card-head">
          <h2 id="h-tasks" style={{ margin: 0 }}>Tasks <span className="faint small">{open.length} open</span></h2>
          <label className="toggle small">
            <input
              type="checkbox"
              checked={showDone}
              onChange={async (e) => {
                setShowDone(e.target.checked);
                await reloadTasks();
              }}
            />
            Show finished
          </label>
        </div>
        <QuickAdd tz={tz} onAdded={() => void reloadTasks()} />
        <details className="small" style={{ margin: "0.2rem 0 0.4rem" }}>
          <summary className="muted" style={{ cursor: "pointer" }}>More options (goal, exact reminder)</summary>
          <form onSubmit={addTask} style={{ marginTop: "0.6rem" }}>
            <div className="inline-form">
              <label htmlFor="t-title" className="sr-only">New task</label>
              <input id="t-title" name="title" placeholder="Task title" required maxLength={300} />
              <button className="btn btn-primary">Add</button>
            </div>
            <div className="form-grid" style={{ marginTop: "0.5rem" }}>
              <div>
                <label htmlFor="t-prio">Priority</label>
                <select id="t-prio" name="priority" defaultValue="2">
                  <option value="1">High</option>
                  <option value="2">Normal</option>
                  <option value="3">Low</option>
                </select>
              </div>
              <div>
                <label htmlFor="t-due">Due</label>
                <input id="t-due" name="dueDate" type="date" />
              </div>
              <div>
                <label htmlFor="t-remind">Remind me</label>
                <input id="t-remind" name="remindAt" type="datetime-local" />
              </div>
              <div>
                <label htmlFor="t-goal">Goal</label>
                <select id="t-goal" name="goalId" defaultValue="">
                  <option value="">None</option>
                  {goals.filter((g) => g.status === "active").map((g) => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        </details>
        {open.length === 0 && !showDone ? (
          <p className="empty" style={{ marginTop: "1rem" }}>Nothing open. Add the next step towards one of your goals.</p>
        ) : (
          groups
            .filter((g) => g.items.length)
            .map((g) => (
              <div key={g.key}>
                <div className={`group-head ${g.cls ?? ""}`}>
                  {g.label} <span className="n">{g.items.length}</span>
                </div>
                <ul className="list-plain tasks">{g.items.map(taskRow)}</ul>
              </div>
            ))
        )}
      </section>

      <section className="card span-5" aria-labelledby="h-goals">
        <h2 id="h-goals">Goals</h2>
        {goals.length === 0 && <p className="empty">No goals recorded yet.</p>}
        {goals.map((g) => {
          const p = prog.get(g.id);
          const pct = p && p.total ? p.done / p.total : 0;
          return (
            <div key={g.id} className="goal-row">
              <div className="top">
                <span className="name" style={{ textDecoration: g.status === "done" ? "line-through" : undefined }}>{g.title}</span>
                <select aria-label={`Status of ${g.title}`} value={g.status} onChange={(e) => setGoalStatus(g, e.target.value as Goal["status"])} style={{ width: "auto", minHeight: 30, padding: "0.1rem 0.4rem", fontSize: "0.8rem" }}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="done">Done</option>
                  <option value="dropped">Dropped</option>
                </select>
              </div>
              {g.status === "active" && <Meter value={pct} label={`${g.title}: ${Math.round(pct * 100)}%`} />}
              <div className="meta">
                {HORIZON_LABEL[g.horizon]}
                {g.metric && ` · ${g.metric}`}
                {g.targetDate && ` · by ${g.targetDate}`}
                {p && p.total > 0 && ` · ${p.done}/${p.total} tasks`}
                {" · "}
                <button className="linkish" onClick={() => removeGoal(g)}>Delete</button>
              </div>
            </div>
          );
        })}
        <form onSubmit={addGoal} style={{ marginTop: "1rem" }}>
          <h3>New goal</h3>
          <div className="field">
            <label htmlFor="g-title">Outcome</label>
            <input id="g-title" name="title" required maxLength={200} placeholder="e.g. Pass the PPL theory exams" />
          </div>
          <div className="field">
            <label htmlFor="g-metric">How you&apos;ll measure it</label>
            <input id="g-metric" name="metric" maxLength={300} placeholder="e.g. all 9 exams passed" />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="g-horizon">Horizon</label>
              <select id="g-horizon" name="horizon" defaultValue="1y">
                {Object.entries(HORIZON_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="g-date">Target date</label>
              <input id="g-date" name="targetDate" type="date" />
            </div>
          </div>
          <button className="btn">Add goal</button>
        </form>
      </section>
    </div>
  );
}
