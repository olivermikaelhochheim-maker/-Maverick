"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { Ring } from "./viz";

interface Session {
  id: string;
  taskId: string | null;
  plannedMinutes: number;
  startedAt: string;
}

/** A short, calm chime at the end of a session (no audio file needed). */
function chime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.65);
    });
  } catch {
    /* audio not available */
  }
}

/**
 * Focus timer: pick a length (and optionally a task), start, and Maverick counts.
 * The session lives on the server, so the timer survives reloads and shows on every device.
 */
export function FocusTimer({ tasks, todayMinutes }: { tasks: { id: string; title: string }[]; todayMinutes: number }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [minutes, setMinutes] = useState(25);
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const finished = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSession((await api<{ session: Session | null }>("/api/focus")).session);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener("mvk:focus-changed", on);
    return () => window.removeEventListener("mvk:focus-changed", on);
  }, [load]);

  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);

  const total = session ? session.plannedMinutes * 60_000 : minutes * 60_000;
  const elapsed = session ? Math.min(total, now - Date.parse(session.startedAt)) : 0;
  const left = Math.max(0, total - elapsed);
  const mm = String(Math.floor(left / 60000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  const taskTitle = session?.taskId ? tasks.find((t) => t.id === session.taskId)?.title : undefined;

  // Session reached its end.
  useEffect(() => {
    if (session && left === 0 && finished.current !== session.id) {
      finished.current = session.id;
      chime();
      toast({ text: `Focus session done: ${session.plannedMinutes} minutes. Well spent. Take five.` });
      if ("Notification" in window && Notification.permission === "granted") new Notification("Maverick", { body: "Focus session complete. Take a short break." });
      setTimeout(() => void load(), 1500);
    }
  }, [left, session, load]);

  useEffect(() => {
    document.title = session && left > 0 ? `${mm}:${ss} · Focus · Maverick` : "Maverick";
  }, [session, left, mm, ss]);

  const start = async () => {
    setBusy(true);
    try {
      const r = await api<{ session: Session }>("/api/focus", { body: { action: "start", minutes, taskId: taskId || undefined } });
      setSession(r.session);
      setNow(Date.now());
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const stop = async (completed: boolean) => {
    setBusy(true);
    try {
      await api("/api/focus", { body: { action: "stop", completed } });
      if (completed) toast(`Logged ${Math.max(1, Math.round(elapsed / 60000))} focused minutes.`);
      setSession(null);
    } finally {
      setBusy(false);
    }
  };

  if (session === undefined) return <div className="skeleton" style={{ height: 120 }} />;

  return (
    <div className={`focus-body`}>
      <Ring size={104} stroke={6} value={session ? elapsed / total : 0} label={session ? `${mm}:${ss} left` : "Focus timer"}>
        <div>
          <div className="focus-time" style={{ fontSize: "1.45rem" }}>{session ? `${mm}:${ss}` : `${minutes}:00`}</div>
          <div className="faint" style={{ fontSize: "0.68rem", letterSpacing: "0.1em" }}>{session ? "LEFT" : "READY"}</div>
        </div>
      </Ring>
      <div style={{ flex: 1, minWidth: 0 }}>
        {session ? (
          <>
            <p style={{ margin: 0, fontWeight: 550 }}>{taskTitle ? `Focusing on “${taskTitle}”` : "Focusing"}</p>
            <p className="small muted" style={{ margin: "0.2rem 0 0.6rem" }}>One thing only. Notifications off, phone face down.</p>
            <div className="row" style={{ gap: "0.4rem" }}>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => stop(true)}>Done</button>
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => stop(false)}>Stop</button>
            </div>
          </>
        ) : (
          <>
            <div className="seg" role="group" aria-label="Focus length" style={{ marginBottom: "0.5rem" }}>
              {[15, 25, 50, 90].map((m) => (
                <button key={m} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m}m</button>
              ))}
            </div>
            {tasks.length > 0 && (
              <select aria-label="Task to focus on" value={taskId} onChange={(e) => setTaskId(e.target.value)} style={{ minHeight: 36, padding: "0.3rem 0.5rem", fontSize: "0.88rem", marginBottom: "0.5rem" }}>
                <option value="">No specific task</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            )}
            <div className="row" style={{ gap: "0.6rem" }}>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={start}>Start focus</button>
              <span className="small faint">{todayMinutes > 0 ? `${todayMinutes} min focused today` : "No focus yet today"}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
