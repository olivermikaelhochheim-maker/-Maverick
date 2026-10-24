import type { SpendSummary } from "@maverick/core";

const fmt = (n: number) => `$${n.toFixed(2)}`;

export function BudgetMeter({ spend }: { spend: SpendSummary }) {
  const pct = Math.min(100, spend.monthFraction * 100);
  const softPct = spend.monthHardUsd > 0 ? Math.min(100, (spend.monthSoftUsd / spend.monthHardUsd) * 100) : 0;
  const cls = spend.hardLimitReached ? "over" : spend.softLimitReached ? "warn" : "";
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.4rem" }}>
        <strong style={{ fontSize: "1.3rem" }}>{fmt(spend.monthUsd)}</strong>
        <span className="muted small">of {fmt(spend.monthHardUsd)} hard limit</span>
      </div>
      <div
        className={`meter ${cls}`}
        role="meter"
        aria-label="Monthly model spend"
        aria-valuemin={0}
        aria-valuemax={spend.monthHardUsd}
        aria-valuenow={Number(spend.monthUsd.toFixed(2))}
      >
        <span style={{ width: `${pct}%` }} />
        <i className="meter-soft" style={{ left: `${softPct}%` }} title={`Soft limit ${fmt(spend.monthSoftUsd)}`} />
      </div>
      <p className="small muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
        Today {fmt(spend.todayUsd)} / {fmt(spend.dailyHardUsd)} · soft limit {fmt(spend.monthSoftUsd)}
        {spend.hardLimitReached && <><br /><span style={{ color: "var(--danger)" }}>Hard limit reached: model calls are paused.</span></>}
        {!spend.hardLimitReached && spend.softLimitReached && <><br /><span style={{ color: "var(--warn)" }}>Soft limit passed: using the fast model.</span></>}
      </p>
    </div>
  );
}
