import { getSettings, getSpend, getUsageBreakdown, MODELS } from "@maverick/core";
import { BudgetMeter } from "@/components/BudgetMeter";
import { getMaverick, requireUser } from "@/lib/server";

const usd = (n: number) => (n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

export default async function UsagePage() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const spend = await getSpend(m.db, user.id, settings);
  const usage = await getUsageBreakdown(m.db, user.id);
  const maxDay = Math.max(0.0001, ...usage.byDay.map((d) => d.costUsd));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Usage &amp; budget</h1>
          <p>Month to date (UTC). Figures are Maverick&apos;s estimate from token counts; your Anthropic console is the official bill.</p>
        </div>
      </div>
      <div className="cards">
        <section className="card span-4">
          <h3>This month</h3>
          <BudgetMeter spend={spend} />
        </section>
        <section className="card span-8">
          <h3>Daily spend</h3>
          {usage.byDay.length === 0 ? (
            <p className="empty">No model calls yet this month.</p>
          ) : (
            <div role="img" aria-label="Daily spend bar chart" style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
              {usage.byDay.map((d) => (
                <div key={d.day} title={`${d.day}: ${usd(d.costUsd)} over ${d.calls} calls`} style={{ flex: 1, minWidth: 6, background: "var(--accent)", opacity: 0.8, borderRadius: 3, height: `${Math.max(3, (d.costUsd / maxDay) * 100)}%` }} />
              ))}
            </div>
          )}
        </section>
        <section className="card span-12">
          <h3>By model</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Model</th><th className="num">Calls</th><th className="num">Input tokens</th><th className="num">Output tokens</th><th className="num">Cost</th></tr>
              </thead>
              <tbody>
                {usage.byModel.length === 0 && (
                  <tr><td colSpan={5} className="empty">Nothing yet.</td></tr>
                )}
                {usage.byModel.map((r) => (
                  <tr key={r.model}>
                    <td>{MODELS[r.model]?.label ?? r.model}</td>
                    <td className="num">{r.calls}</td>
                    <td className="num">{r.inputTokens.toLocaleString()}</td>
                    <td className="num">{r.outputTokens.toLocaleString()}</td>
                    <td className="num">{usd(r.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {usage.estimatedCalls > 0 && (
            <p className="hint">{usage.estimatedCalls} call(s) were interrupted before the provider reported usage, so they&apos;re charged at an estimate.</p>
          )}
        </section>
      </div>
    </div>
  );
}
