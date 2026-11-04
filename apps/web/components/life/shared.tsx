"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Tally } from "@maverick/core/life/score";

export const LIFE_TABS = [
  { href: "/life", label: "Today" },
  { href: "/life/journal", label: "Journal" },
  { href: "/life/habits", label: "Habits" },
];

export function LifeTabs() {
  const pathname = usePathname();
  return (
    <nav className="life-tabs" aria-label="Life">
      {LIFE_TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={pathname === t.href ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Percentage ring. `null` means nothing was scheduled, which is not 0%. */
export function Ring({ pct, size = 72, label }: { pct: number | null; size?: number; label?: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const off = pct === null ? c : c * (1 - pct / 100);
  return (
    <svg className="ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? (pct === null ? "No habits scheduled" : `${pct}%`)}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dy=".35em" textAnchor="middle" className="ring-text">
        {pct === null ? "–" : `${pct}%`}
      </text>
    </svg>
  );
}

export function Bar({ pct }: { pct: number | null }) {
  return (
    <div className="meter" aria-hidden="true">
      <span style={{ width: `${pct ?? 0}%` }} />
    </div>
  );
}

/** One-line description of the counts behind a percentage. */
export function TallyLine({ t, week }: { t: Tally; week?: "current" | "final" | "future" }) {
  if (!t.scheduled && !t.excused) return <span className="faint">No habits scheduled</span>;
  const parts = [`${t.done} of ${t.scheduled} done`];
  if (t.missed) parts.push(`${t.missed} missed`);
  if (t.unlogged) parts.push(`${t.unlogged} not logged`);
  if (t.short) parts.push(`${t.short} ${week === "current" ? "still open on weekly targets" : "short on weekly targets"}`);
  if (t.excused) parts.push(`${t.excused} excused`);
  return <span>{parts.join(" · ")}</span>;
}

/** Line chart of 1–5 ratings, gaps where nothing was rated. */
export function Spark({ label, points }: { label: string; points: { date: string; v: number | null }[] }) {
  const w = 320;
  const h = 90;
  const x = (i: number) => 14 + (i * (w - 22)) / Math.max(1, points.length - 1);
  const y = (v: number) => h - 12 - ((v - 1) / 4) * (h - 24);
  const segs: string[] = [];
  let cur = "";
  points.forEach((p, i) => {
    if (p.v === null) {
      if (cur) segs.push(cur);
      cur = "";
    } else cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const any = points.some((p) => p.v !== null);
  return (
    <figure className="spark">
      <figcaption>{label}</figcaption>
      {any ? (
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label} over the last ${points.length} days`}>
          {[1, 3, 5].map((v) => (
            <g key={v}>
              <line x1={14} x2={w} y1={y(v)} y2={y(v)} className="spark-grid" />
              <text x={0} y={y(v) + 3} className="spark-axis">{v}</text>
            </g>
          ))}
          <path d={segs.join("")} className="spark-line" />
          {points.map((p, i) =>
            p.v === null ? null : (
              <circle key={p.date} cx={x(i)} cy={y(p.v)} r={2.8} className="spark-dot">
                <title>{`${p.date}: ${p.v}`}</title>
              </circle>
            ),
          )}
        </svg>
      ) : (
        <p className="empty small">No ratings in the last {points.length} days. Add them in the journal.</p>
      )}
    </figure>
  );
}

export const STATUS_LABEL: Record<string, string> = { done: "Done", missed: "Missed", rest: "Planned rest", sick: "Ill", excused: "Excused", unlogged: "Not logged" };

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, day!)));
}
