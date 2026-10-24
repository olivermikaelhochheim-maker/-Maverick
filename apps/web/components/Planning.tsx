"use client";

import { useState } from "react";
import type { Goal, Task } from "@maverick/core";
import { api } from "@/lib/client";

const HORIZON_LABEL: Record<Goal["horizon"], string> = { "1y": "1 year", "3y": "3 years", "5y": "5 years", personal: "Personal", other: "Other" };

export function Planning({ initialGoals, initialTasks, today }: { initialGoals: Goal[]; initialTasks: Task[]; today: string }) {
  const [goals, setGoals] = useState(initialGoals);
  const [tasks, setTasks] = useState(initialTasks);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async <T,>(fn: () => Promise<T>) => {
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError((err as Error).message);
      return undefined;
    }
  };
  const reloadTasks = async (all = showDone) => setTasks((await api<{ tasks: Task[] }>(`/api/tasks${all ? "?status=all" : ""}`)).tasks);

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
          // datetime-local is in the browser's time zone; send an absolute instant.
          remindAt: remind ? new Date(remind).toISOString() : null,
        },
      }),
    );
    if (ok) {
      form.reset();
      await reloadTasks();
    }
  };

  const patchTask = async (t: Task, patch: Record<string, unknown>) => {
    if (await run(() => api(`/api/tasks/${t.id}`, { method: "PATCH", body: patch }))) await reloadTasks();
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

  return (
    <div className="cards">
      {error && <div className="alert alert-error span-12" role="alert">{error}</div>}
      <section className="card span-7" aria-labelledby="h-tasks">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 id="h-tasks">Tasks</h2>
          <label className="toggle small">
            <input
              type="checkbox"
              checked={showDone}
              onChange={async (e) => {
                setShowDone(e.target.checked);
                await reloadTasks(e.target.checked);
              }}
            />
            Show finished
          </label>
        </div>
        <form onSubmit={addTask} className="field">
          <label htmlFor="t-title" className="sr-only">New task</label>
          <div className="inline-form">
            <input id="t-title" name="title" placeholder="Add a task, verb first: 'Send proposal to…'" required maxLength={300} />
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
        {tasks.length === 0 ? (
          <p className="empty">No tasks yet.</p>
        ) : (
          <ul className="list-plain tasks">
            {tasks.map((t) => (
              <li key={t.id}>
                <div className={`task-row${t.status !== "open" ? " done" : ""}`}>
                  <input type="checkbox" aria-label={`Mark "${t.title}" done`} checked={t.status === "done"} onChange={() => patchTask(t, { status: t.status === "done" ? "open" : "done" })} />
                  <span className={`prio prio-${t.priority}`} title={`Priority ${t.priority}`} />
                  <span className="task-title">
                    {t.title}
                    <span className="hint" style={{ display: "block", marginTop: 0 }}>
                      {[
                        t.dueDate && (t.dueDate < today && t.status === "open" ? `overdue (${t.dueDate})` : `due ${t.dueDate}`),
                        t.remindAt && `reminder ${new Date(t.remindAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}`,
                        goalTitle(t.goalId) && `→ ${goalTitle(t.goalId)}`,
                        t.source === "suggestion" && "suggested by Maverick",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
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
            ))}
          </ul>
        )}
      </section>

      <section className="card span-5" aria-labelledby="h-goals">
        <h2 id="h-goals">Goals</h2>
        {goals.length === 0 && <p className="empty">No goals recorded yet.</p>}
        <ul className="list-plain">
          {goals.map((g) => (
            <li key={g.id} className="goal-item">
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontWeight: 550, textDecoration: g.status === "done" ? "line-through" : undefined }}>{g.title}</strong>
                  <div className="metric">
                    {HORIZON_LABEL[g.horizon]}
                    {g.metric && ` · ${g.metric}`}
                    {g.targetDate && ` · by ${g.targetDate}`}
                  </div>
                </div>
                <select aria-label={`Status of ${g.title}`} value={g.status} onChange={(e) => setGoalStatus(g, e.target.value as Goal["status"])} style={{ width: "auto" }}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="done">Done</option>
                  <option value="dropped">Dropped</option>
                </select>
              </div>
              <button className="btn btn-sm btn-ghost" style={{ marginTop: "0.2rem", paddingLeft: 0 }} onClick={() => removeGoal(g)}>Delete</button>
            </li>
          ))}
        </ul>
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
