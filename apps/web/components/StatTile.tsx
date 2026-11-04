"use client";

import { CountUp, Sparkline } from "./viz";

/** Stat tile: label · value · delta vs a named period · 14-day trend. */
export function StatTile(props: {
  label: string;
  icon: string;
  value: number;
  format?: "int" | "minutes" | "usd";
  suffix?: string;
  previous?: number;
  /** Is an increase good? (drives the delta colour together with an arrow, never colour alone) */
  upIsGood?: boolean;
  sub?: string;
  series?: number[];
  dates?: string[];
  unit?: string;
  i?: number;
}) {
  const fmt = (n: number) => {
    if (props.format === "minutes") {
      const m = Math.round(n);
      return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
    }
    if (props.format === "usd") return `$${n.toFixed(n < 10 ? 2 : 0)}`;
    return Math.round(n).toLocaleString("en-GB");
  };
  let delta: { text: string; cls: string; arrow: string } | null = null;
  if (props.previous !== undefined) {
    const diff = props.value - props.previous;
    const cls = diff === 0 ? "flat" : (diff > 0) === (props.upIsGood ?? true) ? "good" : "bad";
    const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "■";
    const pct = props.previous > 0 ? ` (${diff > 0 ? "+" : ""}${Math.round((diff / props.previous) * 100)}%)` : "";
    delta = { text: `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${fmt(Math.abs(diff))}${pct}`, cls, arrow };
  }
  return (
    <div className="card tile hoverable reveal" style={{ ["--i" as string]: props.i ?? 0 }}>
      <div className="tile-label"><span aria-hidden>{props.icon}</span>{props.label}</div>
      <div className="tile-value">
        <CountUp value={props.value} format={fmt} />
        {props.suffix && <small>{props.suffix}</small>}
      </div>
      <div className="tile-sub">
        {delta && (
          <span className={`delta ${delta.cls}`}>
            <span aria-hidden>{delta.arrow}</span> {delta.text}
          </span>
        )}
        {delta && <span>vs previous 7 days</span>}
        {props.sub && <span>{props.sub}</span>}
      </div>
      {props.series && props.dates && <Sparkline values={props.series} dates={props.dates} unit={props.unit ?? ""} />}
    </div>
  );
}
