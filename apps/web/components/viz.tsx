"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Small, dependency-free SVG charts following Maverick's chart rules:
 * thin bars (≤ 24px) with a 4px rounded data end and a square baseline,
 * hairline solid gridlines, 2px lines, a hover tooltip on every chart,
 * text in text colours (never series colours), and a table view.
 */

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const weekday = (iso: string) => DAY[new Date(`${iso}T12:00:00Z`).getUTCDay()]!;
const shortDate = (iso: string) => `${weekday(iso)} ${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;

/** Bar path: rounded top corners (data end), square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Count up to a number when it first appears (respects reduced motion). */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-GB") }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return setShown(value);
    first.current = false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.querySelector("[data-reduce-motion='true']")) return setShown(value);
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      setShown(value * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

/** 14-point mini column sparkline for a stat tile; the latest point is accented. */
export function Sparkline({ values, dates, unit }: { values: number[]; dates: string[]; unit: string }) {
  const w = 140;
  const h = 30;
  const max = Math.max(1, ...values);
  const bw = w / values.length;
  return (
    <svg className="spark" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Last ${values.length} days`}>
      {values.map((v, i) => {
        const bh = Math.max(v > 0 ? 3 : 1.5, (v / max) * h);
        return (
          <rect key={i} className={i === values.length - 1 ? "now" : ""} x={i * bw + 1} y={h - bh} width={Math.max(1, bw - 2)} height={bh} rx={1.5}>
            <title>{`${shortDate(dates[i]!)}: ${v} ${unit}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Thin progress ring. */
export function Ring({ size = 64, stroke = 5, value, children, label }: { size?: number; stroke?: number; value: number; children?: ReactNode; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: "relative", width: size, height: size }} role={label ? "img" : undefined} aria-label={label}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ring-fill" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      {children && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{children}</div>}
    </div>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="meter2" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  return { tip, setTip };
}

// Named formats, because server components can't pass functions to client components.
const FORMATS = {
  int: (v: number) => String(Math.round(v)),
  usd: (v: number) => (v === 0 ? "$0" : v < 0.1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`),
  nok: (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))),
  dec: (v: number) => (Math.round(v * 10) / 10).toString(),
};
const monthName = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 7)}-15T12:00:00Z`));

/** Daily column chart (one series). Title names the measure, so no legend. */
export function ColumnChart({ data, unit, valueFormat = "int", height = 150, labelFormat = "day", lastLabel }: { data: { date: string; value: number }[]; unit: string; valueFormat?: keyof typeof FORMATS; height?: number; labelFormat?: "day" | "month"; lastLabel?: string }) {
  const format = FORMATS[valueFormat];
  const label = (iso: string) => (labelFormat === "month" ? monthName(iso) : shortDate(iso));
  const { tip, setTip } = useTip();
  const [table, setTable] = useState(false);
  const W = 560;
  const padL = 30;
  const padB = 22;
  const padT = 8;
  const H = height;
  const rawMax = Math.max(...data.map((d) => d.value));
  // Whole-number measures get whole-number ticks (no "0, 1, 1" axes).
  const max = valueFormat === "int" ? Math.max(2, Math.ceil(niceMax(rawMax))) : niceMax(rawMax);
  const plotW = W - padL;
  const plotH = H - padB - padT;
  const slot = plotW / data.length;
  const bw = Math.min(24, slot - 6);
  const ticks = valueFormat === "int" && max % 2 ? [0, max] : [0, max / 2, max];

  if (table) {
    return (
      <div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{labelFormat === "month" ? "Month" : "Day"}</th><th className="num">{unit}</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.date}><td>{label(d.date)}</td><td className="num">{format(d.value)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="chart-foot"><span /><button className="linkish" onClick={() => setTable(false)}>Show chart</button></div>
      </div>
    );
  }

  return (
    <div className="chart" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${unit} per day`}>
        <g className="grid">
          {ticks.map((t) => (
            <line key={t} x1={padL} x2={W} y1={padT + plotH - (t / max) * plotH} y2={padT + plotH - (t / max) * plotH} />
          ))}
        </g>
        <g className="axis">
          {ticks.map((t) => (
            <text key={t} x={padL - 6} y={padT + plotH - (t / max) * plotH + 3} textAnchor="end">{format(t)}</text>
          ))}
          {data.map((d, i) =>
            labelFormat === "month" || i % 2 === data.length % 2 || i === data.length - 1 ? (
              <text key={d.date} x={padL + i * slot + slot / 2} y={H - 6} textAnchor="middle">
                {i === data.length - 1 ? (lastLabel ?? (labelFormat === "month" ? "Now" : "Today")) : labelFormat === "month" ? monthName(d.date).slice(0, 3) : weekday(d.date).slice(0, 2)}
              </text>
            ) : null,
          )}
        </g>
        {data.map((d, i) => {
          const h = (d.value / max) * plotH;
          const x = padL + i * slot + (slot - bw) / 2;
          const isLast = i === data.length - 1;
          return (
            <g key={d.date}>
              <rect
                className="hit"
                x={padL + i * slot}
                y={padT}
                width={slot}
                height={plotH}
                onMouseEnter={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({ x: ((x + bw / 2) / W) * box.width, y: ((padT + plotH - h) / H) * box.height, content: <><b>{format(d.value)}</b> {unit} · {label(d.date)}</> });
                }}
              />
              {d.value > 0 ? <path className={`bar${isLast ? "" : " dim"}`} d={barPath(x, padT + plotH - h, bw, h)} pointerEvents="none" /> : null}
            </g>
          );
        })}
      </svg>
      {tip && <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>}
      <div className="chart-foot">
        <span>Hover a {labelFormat === "month" ? "month" : "day"} for details</span>
        <button className="linkish" onClick={() => setTable(true)}>Show as table</button>
      </div>
    </div>
  );
}

/** Cumulative month spend vs the hard cap, with a straight-line projection to month end. */
export function SpendChart({ daily, hardUsd, softUsd, daysElapsed }: { daily: { date: string; usd: number }[]; hardUsd: number; softUsd: number; daysElapsed: number }) {
  const { tip, setTip } = useTip();
  const [table, setTable] = useState(false);
  const W = 560;
  const H = 190;
  const padL = 38;
  const padB = 22;
  const padT = 14;
  let run = 0;
  const cum = daily.map((d) => (run += d.usd));
  const actual = cum.slice(0, daysElapsed);
  const spent = actual.at(-1) ?? 0;
  const projected = daysElapsed > 0 ? (spent / daysElapsed) * daily.length : 0;
  const max = niceMax(Math.max(hardUsd, projected, spent) * 1.05);
  const plotW = W - padL - 8;
  const plotH = H - padT - padB;
  const x = (i: number) => padL + (i / Math.max(1, daily.length - 1)) * plotW;
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const linePts = actual.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const areaPts = actual.length ? `${x(0)},${y(0)} ${linePts} ${x(actual.length - 1)},${y(0)}` : "";
  const fmt = (v: number) => (v < 10 ? `$${v.toFixed(2)}` : `$${Math.round(v)}`);
  const ticks = [0, max / 2, max];

  if (table) {
    return (
      <div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Day</th><th className="num">Spent that day</th><th className="num">Month to date</th></tr></thead>
            <tbody>{daily.slice(0, daysElapsed).map((d, i) => <tr key={d.date}><td>{shortDate(d.date)}</td><td className="num">${d.usd.toFixed(4)}</td><td className="num">${cum[i]!.toFixed(2)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="chart-foot"><span /><button className="linkish" onClick={() => setTable(false)}>Show chart</button></div>
      </div>
    );
  }

  return (
    <div className="chart" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Month-to-date model spend against the hard limit">
        <g className="grid">{ticks.map((t) => <line key={t} x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={padL - 6} y={y(t) + 3} textAnchor="end">{fmt(t)}</text>)}
          {[0, 9, 19, daily.length - 1].map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{Number(daily[i]!.date.slice(8))}</text>)}
        </g>
        <line className="ref" x1={padL} x2={W - 8} y1={y(hardUsd)} y2={y(hardUsd)} />
        <text className="ref-label" x={W - 10} y={y(hardUsd) - 4} textAnchor="end">⚠ Hard limit ${hardUsd}</text>
        {softUsd < hardUsd && <text className="ref-label" x={padL + 4} y={y(softUsd) - 4}>Soft ${softUsd}</text>}
        {softUsd < hardUsd && <line x1={padL} x2={W - 8} y1={y(softUsd)} y2={y(softUsd)} stroke="var(--grid)" strokeWidth={1} />}
        {actual.length > 0 && <polygon className="area" points={areaPts} />}
        {actual.length > 0 && <polyline className="line" points={linePts} />}
        {actual.length > 0 && daysElapsed < daily.length && (
          <line className="line projection" x1={x(actual.length - 1)} y1={y(spent)} x2={x(daily.length - 1)} y2={y(projected)} />
        )}
        {actual.length > 0 && <circle className="dot" cx={x(actual.length - 1)} cy={y(spent)} r={4.5} />}
        {daily.map((d, i) => (
          <rect
            key={d.date}
            className="hit"
            x={x(i) - plotW / daily.length / 2}
            y={padT}
            width={plotW / daily.length}
            height={plotH}
            onMouseEnter={(e) => {
              const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              const v = i < daysElapsed ? cum[i]! : spent + ((projected - spent) * (i - (daysElapsed - 1))) / Math.max(1, daily.length - daysElapsed);
              setTip({
                x: (x(i) / W) * box.width,
                y: (y(v) / H) * box.height,
                content: i < daysElapsed ? <><b>{fmt(cum[i]!)}</b> by {shortDate(d.date)} (+${d.usd.toFixed(3)})</> : <>Projected <b>{fmt(v)}</b> by {shortDate(d.date)}</>,
              });
            }}
          />
        ))}
      </svg>
      {tip && <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>}
      <div className="chart-foot">
        <span>Solid: spent · faded: projection at the current pace</span>
        <button className="linkish" onClick={() => setTable(true)}>Show as table</button>
      </div>
    </div>
  );
}

/** Horizontal bars with direct labels (identity never by colour alone). */
export function HBars({ rows }: { rows: { label: string; value: number; display: string; color: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 0.000001);
  return (
    <div role="table" aria-label="Breakdown">
      {rows.map((r) => (
        <div key={r.label} className="hbar-row" role="row">
          <span role="cell" style={{ overflowWrap: "anywhere" }}>
            <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: r.color, marginRight: 6 }} aria-hidden />
            {r.label}
          </span>
          <div className="hbar-track" role="cell" title={`${r.label}: ${r.display}`}>
            <div className="hbar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </div>
          <span className="val" role="cell">{r.display}</span>
        </div>
      ))}
    </div>
  );
}
