"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { AICore } from "./AICore";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { kickLive, MODE_LABEL, useLive } from "@/lib/live";
import { canListen, Listener, loadPrefs } from "@/lib/voice";

function Clock({ tz }: { tz: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className="cb-clock" aria-hidden>--:--:--</span>;
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
  const zone = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "";
  return (
    <span className="cb-clock" aria-label={`Local time ${f}`}>
      {f}
      <small>{zone}</small>
    </span>
  );
}

/** Push-to-talk command: "Maverick, prepare tomorrow's briefing" launches the mission; anything else goes to chat. */
function VoiceCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listener = useRef<Listener | null>(null);

  const route = async (said: string) => {
    try {
      const r = await api<{ route: "mission" | "chat"; mission?: { id: string; title: string; steps: number } }>("/api/command", { body: { text: said, voice: true } });
      if (r.route === "mission" && r.mission) {
        toast({ text: `Mission launched: ${r.mission.title} (${r.mission.steps} steps)`, link: { label: "Open", href: `/missions/${r.mission.id}` } });
        kickLive();
        router.push(`/missions/${r.mission.id}`);
      } else {
        router.push(`/chat?q=${encodeURIComponent(said)}`);
      }
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    }
  };

  const start = () => {
    if (!canListen()) {
      toast({ text: "This browser can't transcribe speech. Use Safari or Chrome.", kind: "error" });
      return;
    }
    setError(null);
    setText("");
    setOpen(true);
    const prefs = loadPrefs();
    const l = new Listener(prefs.lang, {
      onText: (t) => setText(t),
      onEnd: (final) => {
        listener.current = null;
        window.dispatchEvent(new CustomEvent("mvk:core", { detail: { source: "voice-cmd", listening: false } }));
        setOpen(false);
        if (final) void route(final);
      },
      onError: (m) => {
        setError(m);
        window.dispatchEvent(new CustomEvent("mvk:core", { detail: { source: "voice-cmd", listening: false } }));
      },
    });
    listener.current = l;
    window.dispatchEvent(new CustomEvent("mvk:core", { detail: { source: "voice-cmd", listening: true } }));
    l.start();
  };

  const cancel = () => {
    listener.current?.cancel();
    listener.current = null;
    setOpen(false);
    window.dispatchEvent(new CustomEvent("mvk:core", { detail: { source: "voice-cmd", listening: false } }));
  };

  return (
    <>
      <button className={`icon-btn${open ? " on" : ""}`} onClick={open ? () => listener.current?.stop() : start} aria-pressed={open} aria-label={open ? "Finish voice command" : "Voice command"} title="Voice command">
        <Icon.mic />
      </button>
      {open && (
        <div className="voice-cmd" role="status">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="tele" style={{ color: "var(--danger)" }}><span className="rec-dot" style={{ display: "inline-block", marginRight: 6 }} />Listening · microphone on</span>
          </div>
          <div className="vc-text">{text || <span className="faint">Say a command, e.g. “Prepare me for tomorrow” or “Run a situation report”.</span>}</div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="row">
            <button className="btn btn-sm btn-ghost" onClick={cancel}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={() => listener.current?.stop()}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}

export function CommandBar({ mode, tz, onOpenIntel }: { mode: "live" | "mock"; tz: string; onOpenIntel: () => void }) {
  const { data, core, online } = useLive();
  const [busy, setBusy] = useState(false);
  const halted = data?.status.halted ?? false;
  const m = data?.status.mode ?? 2;
  const approvals = data?.status.awaitingApproval ?? 0;
  const cal = data?.calendar ?? "none";

  const estop = async () => {
    if (halted && !window.confirm("Release the emergency stop? Missions and automations will resume under your current autonomy mode.")) return;
    setBusy(true);
    try {
      await api("/api/agent/halt", { body: { halted: !halted } });
      toast(halted ? "Emergency stop released." : "EMERGENCY STOP engaged. Everything is halted.");
      kickLive();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="cmdbar">
      <Link href="/" className="cb-id" aria-label="Maverick, Command Center">
        <AICore state={core} size={28} label={false} />
        <span className="cb-name">MAVERICK</span> <small>COMMAND</small>
      </Link>
      <span className="cb-sep cb-hide-sm" />
      <button className="cb-search cb-hide-sm" onClick={() => window.dispatchEvent(new Event("mvk:palette"))}>
        <span>Ask, command or jump to…</span> <span className="kbd">⌘K</span>
      </button>
      <span className="cb-spacer" />
      <button className="icon-btn mobile-only" onClick={() => window.dispatchEvent(new Event("mvk:palette"))} aria-label="Ask, command or jump to" title="Ask, command or jump to">
        <Icon.search />
      </button>
      <div className="cb-group cb-hide-md" aria-label="System health">
        <span className={`light ${mode === "live" ? "ok" : "warn"}`} title={mode === "live" ? "AI model connected" : "Mock mode: no API key"}><i />AI {mode === "live" ? "live" : "mock"}</span>
        <span className={`light ${cal === "google" || cal === "link" ? "ok" : cal === "mock" ? "warn" : "off"}`} title="Calendar (read-only)"><i />CAL {cal === "google" || cal === "link" ? "on" : cal === "mock" ? "demo" : "off"}</span>
        <span className={`light ${!online ? "bad" : halted ? "bad" : "ok"}`} title="Mission engine"><i />ENG {!online ? "lost" : halted ? "halt" : "ok"}</span>
      </div>
      <span className="cb-sep cb-hide-md" />
      <span className="cb-hide-sm"><Clock tz={tz} /></span>
      <Link href="/permissions" className={`mode-pill m${m}`} title="Autonomy mode: change in Permissions">
        <span className="cb-hide-sm">Mode </span><span className="mobile-only">M</span>{m}<span className="cb-hide-sm"> · {MODE_LABEL[m]}</span>
      </Link>
      <button className="icon-btn" onClick={onOpenIntel} aria-label={`Intelligence panel${approvals ? `, ${approvals} approvals waiting` : ""}`} title="Approvals & activity">
        <Icon.bell />
        {approvals > 0 && <span className="count">{approvals}</span>}
      </button>
      <VoiceCommand />
      <button className={`estop${halted ? " active" : ""}`} onClick={estop} disabled={busy} aria-pressed={halted} aria-label={halted ? "RELEASE emergency stop" : "E-STOP: halt all missions and automations now"} title={halted ? "Release emergency stop" : "Emergency stop: halt all missions and automations now"}>
        <span className="dot" /> <span className="lbl">{halted ? "RELEASE" : "E-STOP"}</span>
      </button>
    </header>
  );
}
