"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export interface TaskView {
  id: string;
  title: string;
  priority: 1 | 2 | 3;
  dueDate: string | null;
  status: "open" | "done" | "dropped";
}

/** Top open tasks with a tick box. Used on the Command Center. */
export function TaskQuickList({ initial, today }: { initial: TaskView[]; today: string }) {
  const [tasks, setTasks] = useState(initial);
  const toggle = async (t: TaskView) => {
    const status = t.status === "done" ? "open" : "done";
    setTasks((xs) => xs.map((x) => (x.id === t.id ? { ...x, status } : x)));
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { status } });
    } catch {
      setTasks((xs) => xs.map((x) => (x.id === t.id ? t : x)));
    }
  };
  if (!tasks.length) return <p className="empty">No open tasks. <a href="/planning">Add one</a> or ask Maverick to help plan.</p>;
  return (
    <ul className="list-plain tasks">
      {tasks.map((t) => (
        <li key={t.id}>
          <label className={`task-row${t.status === "done" ? " done" : ""}`}>
            <input type="checkbox" checked={t.status === "done"} onChange={() => toggle(t)} />
            <span className={`prio prio-${t.priority}`} title={`Priority ${t.priority}`} />
            <span className="task-title">{t.title}</span>
            {t.dueDate && <span className={`badge ${t.dueDate < today ? "badge-danger" : t.dueDate === today ? "badge-warn" : ""}`}>{t.dueDate < today ? "overdue" : t.dueDate === today ? "today" : t.dueDate}</span>}
          </label>
        </li>
      ))}
    </ul>
  );
}
