import { computeDashboard, getSettings, getSpend, getUsageBreakdown, MODELS } from "@maverick/core";
import { StatTile } from "@/components/StatTile";
import { ColumnChart, HBars, SpendChart } from "@/components/viz";
import { getMaverick, requireUser } from "@/lib/server";

const usd = (n: number) => (n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
// Chart series colours, validated for the navy surface (cyan, orange, violet).
const MODEL_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

export default async function UsagePage() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const [spend, usage, d] = await Promise.all([
    getSpend(m.db, user.id, settings),
    getUsageBreakdown(m.db, user.id),
    computeDashboard(m.db, m.cipher, m.deps, user, settings),
  ]);
  const calls = usage.byModel.reduce((n, r) => n + r.calls, 0);
  const avgDay = d.spend.daysElapsed ? spend.monthUsd / d.spend.daysElapsed : 0;
  const perCall = calls ? spend.monthUsd / calls : 0;
  const status = d.spend.projectedUsd >= spend.monthHardUsd ? "over" : d.spend.projectedUsd >= spend.monthSoftUsd ? "soft" : "ok";
  const last14 = d.spend.dailyUsd.slice(Math.max(0, d.spend.daysElapsed - 14), d.spend.daysElapsed);

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <div className="page-head">
        <div>
          <h1>Usage &amp; budget</h1>
          <p>Model spend this month (UTC). Figures are estimates from token counts; your Anthropic console is the official bill.</p>
        </div>
        <a className="btn btn-sm" href="/settings">Adjust limits</a>
      </div>

      <div className={`alert ${status === "ok" ? "alert-ok" : status === "soft" ? "alert-warn" : "alert-error"}`} role="status">
        {status === "ok" && <>✓ On track: projected {usd(d.spend.projectedUsd)} this month, within your soft limit of ${spend.monthSoftUsd}.</>}
        {status === "soft" && <>◆ Heads-up: projected {usd(d.spend.projectedUsd)}, above your soft limit (${spend.monthSoftUsd}). Maverick will switch to the cheapest model once you reach it.</>}
        {status === "over" && <>! Projected {usd(d.spend.projectedUsd)} would pass your hard limit (${spend.monthHardUsd}). Calls stop at the limit.</>}
      </div>

      <div className="tiles" style={{ marginBottom: "1rem" }}>
        <StatTile i={1} icon="$" label="Spent this month" value={spend.monthUsd} format="usd" sub={`of $${spend.monthHardUsd} hard limit`} />
        <StatTile i={2} icon="↗" label="Projected month end" value={d.spend.projectedUsd} format="usd" sub={`day ${d.spend.daysElapsed} of ${d.spend.daysInMonth}`} />
        <StatTile i={3} icon="∅" label="Average per day" value={avgDay} format="usd" sub={`today ${usd(spend.todayUsd)} of $${spend.dailyHardUsd}`} />
        <StatTile i={4} icon="✉" label="Per model call" value={perCall} format="usd" sub={`${calls} calls this month`} />
      </div>

      <div className="cards">
        <section className="card span-8 reveal" aria-labelledby="h-cum">
          <div className="card-head">
            <h3 id="h-cum">Month to date vs. limits</h3>
          </div>
          <SpendChart daily={d.spend.dailyUsd} hardUsd={spend.monthHardUsd} softUsd={spend.monthSoftUsd} daysElapsed={d.spend.daysElapsed} />
        </section>

        <section className="card span-4 reveal" aria-labelledby="h-models">
          <div className="card-head">
            <h3 id="h-models">Cost by model</h3>
          </div>
          {usage.byModel.length === 0 ? (
            <p className="empty">No model calls yet this month.</p>
          ) : (
            <HBars
              rows={usage.byModel.slice(0, 3).map((r, i) => ({
                label: (MODELS[r.model]?.label ?? r.model).replace(/^Claude /, "").replace(/ \(.*\)$/, ""),
                value: r.costUsd,
                display: usd(r.costUsd),
                color: MODEL_COLORS[i]!,
              }))}
            />
          )}
          <p className="hint" style={{ marginTop: "0.8rem" }}>Fast questions go to Haiku, analysis to Sonnet, “Think deeper” to Opus.</p>
        </section>

        <section className="card span-6 reveal" aria-labelledby="h-daily">
          <div className="card-head">
            <h3 id="h-daily">Spend per day</h3>
            <span className="small faint">Last {last14.length} days</span>
          </div>
          {last14.length ? (
            <ColumnChart data={last14.map((x) => ({ date: x.date, value: Number(x.usd.toFixed(4)) }))} unit="USD" valueFormat="usd" />
          ) : (
            <p className="empty">No data yet.</p>
          )}
        </section>

        <section className="card span-6 reveal" aria-labelledby="h-table">
          <div className="card-head">
            <h3 id="h-table">By model (detail)</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Model</th><th className="num">Calls</th><th className="num">Input</th><th className="num">Output</th><th className="num">Cost</th></tr>
              </thead>
              <tbody>
                {usage.byModel.length === 0 && (
                  <tr><td colSpan={5} className="empty">Nothing yet.</td></tr>
                )}
                {usage.byModel.map((r) => (
                  <tr key={r.model}>
                    <td>{MODELS[r.model]?.label ?? r.model}</td>
                    <td className="num">{r.calls}</td>
                    <td className="num">{r.inputTokens.toLocaleString("en-GB")}</td>
                    <td className="num">{r.outputTokens.toLocaleString("en-GB")}</td>
                    <td className="num">{usd(r.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {usage.estimatedCalls > 0 && <p className="hint">{usage.estimatedCalls} interrupted call(s) were charged at an estimate.</p>}
        </section>
      </div>
    </div>
  );
}
