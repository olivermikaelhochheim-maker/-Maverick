"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "./client";

export type CoreState = "idle" | "listening" | "thinking" | "executing" | "alert" | "complete";

export interface LiveStatus {
  status: {
    mode: 1 | 2 | 3 | 4;
    halted: boolean;
    core: "idle" | "executing" | "alert" | "complete";
    running: number;
    awaitingApproval: number;
    executingStep: { missionId: string; title: string; tool: string } | null;
    lastCompleted: { id: string; title: string; at: string } | null;
    autoActionsToday: number;
    dailyAutoActions: number;
    automations: { enabled: number; nextRun: string | null };
  };
  approvals: {
    id: string;
    missionId: string;
    missionTitle: string;
    title: string;
    preview: string;
    risk: "read" | "low" | "medium" | "high";
    agent: string;
    decisionReason: string | null;
  }[];
  events: { id: number; missionId: string | null; level: "info" | "success" | "warn" | "error"; kind: string; message: string; createdAt: string }[];
  live: boolean;
  calendar: "google" | "link" | "mock" | "none";
}

interface Ctx {
  data: LiveStatus | null;
  /** Bound to real events: server engine state + this browser's mic and pending chat. */
  core: CoreState;
  coreDetail: string;
  refresh: () => Promise<void>;
  online: boolean;
}

const LiveCtx = createContext<Ctx>({ data: null, core: "idle", coreDetail: "", refresh: async () => {}, online: true });

export const useLive = () => useContext(LiveCtx);

/** Polls the engine every 3 s while the tab is visible (and right after any action). */
export function LiveProvider({ children, initial }: { children: ReactNode; initial: LiveStatus | null }) {
  const [data, setData] = useState<LiveStatus | null>(initial);
  const [online, setOnline] = useState(true);
  const [client, setClient] = useState<{ listening: boolean; thinking: boolean }>({ listening: false, thinking: false });
  const sources = useRef(new Map<string, { listening: boolean; thinking: boolean }>());
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      setData(await api<LiveStatus>("/api/agent/status"));
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const t = setInterval(tick, 3000);
    const onVis = () => tick();
    const onKick = () => void refresh();
    const onCore = (e: Event) => {
      const d = (e as CustomEvent<{ source: string; listening?: boolean; thinking?: boolean }>).detail;
      sources.current.set(d.source, { listening: Boolean(d.listening), thinking: Boolean(d.thinking) });
      const all = [...sources.current.values()];
      setClient({ listening: all.some((x) => x.listening), thinking: all.some((x) => x.thinking) });
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("mvk:refresh", onKick);
    window.addEventListener("mvk:core", onCore);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("mvk:refresh", onKick);
      window.removeEventListener("mvk:core", onCore);
    };
  }, [refresh]);

  const value = useMemo<Ctx>(() => {
    const s = data?.status;
    // Precedence: the mic is the most important thing to show truthfully, then the stop.
    let core: CoreState = "idle";
    let coreDetail = "Standing by.";
    if (client.listening) {
      core = "listening";
      coreDetail = "Microphone on. Listening.";
    } else if (s?.halted) {
      core = "alert";
      coreDetail = "Emergency stop is on. Nothing will run.";
    } else if (s && s.awaitingApproval > 0) {
      core = "alert";
      coreDetail = `${s.awaitingApproval} step${s.awaitingApproval === 1 ? "" : "s"} waiting for your approval.`;
    } else if (s?.core === "executing") {
      core = "executing";
      coreDetail = s.executingStep ? `Executing: ${s.executingStep.title}` : "Executing mission steps.";
    } else if (client.thinking) {
      core = "thinking";
      coreDetail = "Thinking.";
    } else if (s?.core === "complete" && s.lastCompleted) {
      core = "complete";
      coreDetail = `Mission complete: ${s.lastCompleted.title}`;
    } else if (!online) {
      core = "alert";
      coreDetail = "Can't reach the Maverick server.";
    }
    return { data, core, coreDetail, refresh, online };
  }, [data, client, refresh, online]);

  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

/** Ask every live view to refresh now (after an action). */
export const kickLive = () => window.dispatchEvent(new Event("mvk:refresh"));

export const MODE_LABEL: Record<number, string> = { 1: "Advisory", 2: "Assisted", 3: "Autonomous", 4: "Autopilot" };

export function timeHM(iso: string, tz?: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date(iso));
}
