"use client";

import { useId } from "react";
import type { CoreState } from "@/lib/live";

const COLORS: Record<CoreState, string> = {
  idle: "#3fd8ea",
  listening: "#ff6464",
  thinking: "#5b9dff",
  executing: "#3fd8ea",
  alert: "#f5b544",
  complete: "#34d399",
};

const LABELS: Record<CoreState, string> = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  executing: "Executing",
  alert: "Alert",
  complete: "Complete",
};

/**
 * Maverick's living core. Its state is passed in from real events only
 * (see lib/live.tsx): it never animates "busy" when nothing is running.
 */
export function AICore({ state, size = 180, label = true, detail }: { state: CoreState; size?: number; label?: boolean; detail?: string }) {
  const id = useId().replace(/:/g, "");
  const c = COLORS[state];
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="core-wrap">
      <svg className={`core s-${state}`} width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={`Maverick core: ${LABELS[state]}${detail ? `. ${detail}` : ""}`}>
        <defs>
          <radialGradient id={`n-${id}`} cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#f2fdff" />
            <stop offset="35%" stopColor={c} />
            <stop offset="100%" stopColor={c} stopOpacity="0.05" />
          </radialGradient>
          <radialGradient id={`g-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={c} stopOpacity="0.45" />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`s-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c} stopOpacity="0" />
            <stop offset="100%" stopColor={c} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <circle className="c-glow" cx="100" cy="100" r="96" fill={`url(#g-${id})`} />
        <g className="c-ticks">
          {ticks.map((i) => (
            <line key={i} x1="100" y1="6" x2="100" y2={i % 5 === 0 ? 14 : 10} stroke={c} strokeOpacity={i % 5 === 0 ? 0.6 : 0.25} strokeWidth="1" transform={`rotate(${i * 6} 100 100)`} />
          ))}
        </g>
        <circle cx="100" cy="100" r="80" fill="none" stroke={c} strokeOpacity="0.14" />
        <g className="c-sweep">
          <path d="M100 100 L100 20 A80 80 0 0 1 169.3 60 Z" fill={`url(#s-${id})`} />
        </g>
        <g className="c-ring c-ring-a">
          <circle cx="100" cy="100" r="68" fill="none" stroke={c} strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="120 30 14 30 40 40" />
        </g>
        <g className="c-ring c-ring-b">
          <circle cx="100" cy="100" r="54" fill="none" stroke={c} strokeOpacity="0.4" strokeWidth="1" strokeDasharray="3 7" />
        </g>
        <circle cx="100" cy="100" r="42" fill="none" stroke={c} strokeOpacity="0.2" />
        <circle className="c-nucleus" cx="100" cy="100" r="26" fill={`url(#n-${id})`} />
        <circle cx="100" cy="100" r="26" fill="none" stroke="#f2fdff" strokeOpacity="0.45" strokeWidth="0.8" />
        <path d="M60 100h10M130 100h10M100 60v10M100 130v10" stroke={c} strokeOpacity="0.5" strokeWidth="1" />
      </svg>
      {label && (
        <>
          <span className={`core-state s-${state}`} aria-live="polite">{LABELS[state]}</span>
          {detail !== undefined && <span className="core-detail">{detail}</span>}
        </>
      )}
    </div>
  );
}
