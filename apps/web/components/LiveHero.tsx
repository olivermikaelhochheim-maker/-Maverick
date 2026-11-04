"use client";

import { useEffect, useState } from "react";
import { BriefNowButton } from "./BriefNowButton";
import { Ring } from "./viz";

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function nowIn(tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { h: Number(parts.hour), m: Number(parts.minute), s: Number(parts.second) };
}

function until(minutes: number): string {
  if (minutes < 1) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `in ${h}h${m ? ` ${m}m` : ""}`;
}

/** Greeting, live clock, waking-day progress and the next event, all ticking. */
export function LiveHero(props: {
  name: string;
  dateLabel: string;
  tz: string;
  wake: string;
  sleep: string;
  nextEvent: { title: string; when: string; startsAt: string } | null;
  summary: string;
}) {
  const [t, setT] = useState<{ h: number; m: number; s: number } | null>(null);
  useEffect(() => {
    setT(nowIn(props.tz));
    const id = setInterval(() => setT(nowIn(props.tz)), 1000);
    return () => clearInterval(id);
  }, [props.tz]);

  const minutes = t ? t.h * 60 + t.m : null;
  const greeting = minutes === null ? "Hello" : minutes < 300 ? "Burning the midnight oil" : minutes < 720 ? "Good morning" : minutes < 1080 ? "Good afternoon" : "Good evening";
  const wake = toMin(props.wake);
  const sleep = toMin(props.sleep) > wake ? toMin(props.sleep) : 22 * 60;
  const dayFrac = minutes === null ? 0 : Math.max(0, Math.min(1, (minutes - wake) / (sleep - wake)));
  const hoursLeft = minutes === null ? 0 : Math.max(0, (sleep - minutes) / 60);
  const nextMin = props.nextEvent && t ? Math.round((Date.parse(props.nextEvent.startsAt) - Date.now()) / 60000) : null;

  return (
    <section className="card cockpit-hero reveal" aria-label="Today">
      <div className="hero-ring">
        <Ring size={92} stroke={6} value={dayFrac} label={`${Math.round(dayFrac * 100)}% of your waking day has passed`}>
          <div>
            <div style={{ fontSize: "1.2rem", fontWeight: 600 }} className="ring-label">{Math.round(dayFrac * 100)}%</div>
            <div className="faint" style={{ fontSize: "0.62rem", letterSpacing: "0.1em" }}>OF DAY</div>
          </div>
        </Ring>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow">{props.dateLabel}</div>
        <h1>{greeting}, {props.name}.</h1>
        <div className="hero-meta">
          <span>{props.summary}</span>
          {hoursLeft > 0 && <span><strong>{hoursLeft.toFixed(1)}h</strong> of your day left</span>}
        </div>
        <div className="quick-actions">
          {props.nextEvent && nextMin !== null && nextMin > -1 && (
            <span className="next-up" title={props.nextEvent.when}>◷ {props.nextEvent.title} · {until(nextMin)}</span>
          )}
          <button className="btn btn-sm" onClick={() => window.dispatchEvent(new Event("mvk:palette"))}>
            ✦ Ask or do anything <span className="kbd" style={{ marginLeft: 4 }}>⌘K</span>
          </button>
          <BriefNowButton />
        </div>
      </div>
      <div className="clock" aria-label="Current time">
        {t ? `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}` : "--:--"}
        <small>{props.tz.replace("_", " ")}</small>
      </div>
    </section>
  );
}
