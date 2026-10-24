/**
 * Maverick's presence indicator: a restrained circular visualisation.
 * idle = slow drift, thinking = counter-rotating rings, speaking = core pulse.
 * All motion is disabled under reduced-motion preferences (see globals.css).
 */
import { useId } from "react";

export function Orb({ size = 64, state = "idle", label }: { size?: number; state?: "idle" | "thinking" | "speaking"; label?: string }) {
  // Unique per instance: a shared id breaks when the first copy sits in a hidden element.
  const gradientId = `orb-core-${useId().replace(/:/g, "")}`;
  return (
    <svg
      className={`orb ${state}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#bff6fc" />
          <stop offset="45%" stopColor="#3fd8ea" />
          <stop offset="100%" stopColor="#0b4a5a" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="none" stroke="#3fd8ea" strokeOpacity="0.12" strokeWidth="1" />
      <g className="ring ring-a">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#3fd8ea" strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="60 22 8 22" />
      </g>
      <g className="ring ring-b">
        <circle cx="50" cy="50" r="31" fill="none" stroke="#3fd8ea" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="4 6" />
      </g>
      <circle className="core" cx="50" cy="50" r="17" fill={`url(#${gradientId})`} />
      <circle cx="50" cy="50" r="17" fill="none" stroke="#bff6fc" strokeOpacity="0.5" strokeWidth="0.6" />
    </svg>
  );
}
