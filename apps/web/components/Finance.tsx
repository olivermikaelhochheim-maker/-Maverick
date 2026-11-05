"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { ColumnChart, HBars } from "./viz";

type Category = string;
interface Tx { id: string; date: string; amountMinor: number; description: string; category: Category; source: "manual" | "csv" }
interface MonthSummary { month: string; incomeMinor: number; spendMinor: number; netMinor: number; byCategory: { category: Category; spendMinor: number; count: number }[]; transactions: number }
interface Intel {
  hasData: boolean;
  firstDate: string | null;
  lastDate: string | null;
  months: MonthSummary[];
  current: MonthSummary | null;
  previous: MonthSummary | null;
  budgets: { category: Category; limitMinor: number; spentMinor: number; pace: number; projectedMinor: number }[];
  recurring: { key: string; label: string; category: Category; typicalMinor: number; months: number; lastDate: string }[];
  anomalies: { id: string; date: string; description: string; amountMinor: number; typicalMinor: number; reason: string }[];
  insights: { kind: "warning" | "win" | "tip"; text: string }[];
}

export const nok = (minor: number, sign = false) => {
  const v = Math.round(minor / 100);
  return `${v < 0 ? "−" : sign && v > 0 ? "+" : ""}${new Intl.NumberFormat("nb-NO").format(Math.abs(v)).replace(/ /g, " ")} kr`;
};

export function FinanceView({ initial, labels }: { initial: { intel: Intel; transactions: Tx[]; today: string }; labels: Record<string, string> }) {
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ date: initial.today, amount: "", description: "", category: "" });
  const [budget, setBudget] = useState({ category: "groceries", monthlyNok: "" });
  const [filter, setFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cats = Object.keys(labels);

  const reload = async () => setD(await api("/api/finance"));
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (f: File) => {
    if (f.size > 2_000_000) return toast({ text: "That file is too large (max 2 MB).", kind: "error" });
    const buf = await f.arrayBuffer();
    // Norwegian bank exports are UTF-8 or Windows-1252; fall back if UTF-8 decoding produces replacement characters.
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
    await run(async () => {
      const r = await api<{ result: { added: number; duplicates: number; skipped: { line: number; reason: string }[]; from: string | null; to: string | null } }>("/api/finance/import", { body: { text } });
      toast(`Imported ${r.result.added} transaction${r.result.added === 1 ? "" : "s"}${r.result.from ? ` (${r.result.from} → ${r.result.to})` : ""}${r.result.duplicates ? ` · ${r.result.duplicates} already there` : ""}${r.result.skipped.length ? ` · ${r.result.skipped.length} lines skipped` : ""}.`);
    });
  };

  const i = d.intel;
  const cur = i.current;
  const shown = d.transactions.filter((t) => !filter || t.category === filter);

  return (
    <div className="cards">
      <section className="card span-12" aria-labelledby="h-src">
        <div className="card-head"><h3 id="h-src">Data source</h3><span className="tele">{i.hasData ? `${i.firstDate} → ${i.lastDate}` : "no data"}</span></div>
        <p className="small muted">Only what you import or type in. No bank connection exists: Maverick never sees your bank login and can't move money. Export a CSV from your bank's website (DNB, SpareBank 1, Sbanken, Nordea and most others work) and import it here. Re-importing the same file adds nothing twice.</p>
        <div className="row">
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
          <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>Import bank CSV</button>
        </div>
      </section>

      {!i.hasData ? (
        <section className="card span-12 empty-state"><span className="tele">No financial data</span>Import a bank CSV or add a transaction below. Nothing on this screen is estimated or invented.</section>
      ) : (
        <>
          <section className="card span-12" aria-labelledby="h-month">
            <div className="card-head"><h3 id="h-month">This month · {cur?.month ?? d.today.slice(0, 7)}</h3></div>
            <div className="telemetry">
              <div><span className="tele">Spent</span><div className="v">{nok(cur?.spendMinor ?? 0)}</div></div>
              <div><span className="tele">Income</span><div className="v">{nok(cur?.incomeMinor ?? 0)}</div></div>
              <div><span className="tele">Net</span><div className="v">{nok(cur?.netMinor ?? 0, true)}</div></div>
              <div><span className="tele">Last month spent</span><div className="v">{i.previous ? nok(i.previous.spendMinor) : "—"}</div></div>
              <div><span className="tele">Transactions</span><div className="v">{cur?.transactions ?? 0}</div></div>
            </div>
            {i.insights.length > 0 && (
              <ul className="insights" style={{ marginTop: "0.9rem" }}>
                {i.insights.map((x, n) => (
                  <li key={n} className={`insight ${x.kind}`}><span className="ico" aria-hidden>{x.kind === "warning" ? "!" : x.kind === "win" ? "✓" : "i"}</span><p><span className="kind">{x.kind}</span>{x.text}</p><span /></li>
                ))}
              </ul>
            )}
          </section>
          <section className="card span-6" aria-labelledby="h-cat">
            <div className="card-head"><h3 id="h-cat">Spending by category</h3><span className="tele">this month</span></div>
            {cur?.byCategory.length ? <HBars rows={cur.byCategory.slice(0, 8).map((c) => ({ label: labels[c.category] ?? c.category, value: c.spendMinor, display: nok(c.spendMinor), color: "var(--chart-1)" }))} /> : <p className="empty">No spending this month yet.</p>}
          </section>
          <section className="card span-6" aria-labelledby="h-trend">
            <div className="card-head"><h3 id="h-trend">Monthly spending</h3><span className="tele">last {i.months.length} months</span></div>
            <ColumnChart data={i.months.map((m) => ({ date: `${m.month}-01`, value: Math.round(m.spendMinor / 100) }))} unit="kr" valueFormat="nok" height={150} labelFormat="month" />
          </section>
          <section className="card span-6" aria-labelledby="h-bud">
            <div className="card-head"><h3 id="h-bud">Budgets</h3></div>
            {i.budgets.length ? (
              i.budgets.map((b) => (
                <div key={b.category} className="goal-row">
                  <div className="top"><span className="name">{labels[b.category]}</span><span className="pct">{nok(b.spentMinor)} / {nok(b.limitMinor)}</span></div>
                  <div className={`meter${b.spentMinor > b.limitMinor ? " over" : b.projectedMinor > b.limitMinor ? " warn" : ""}`}><span style={{ width: `${Math.min(100, b.pace * 100)}%` }} /></div>
                  <div className="meta">On pace for {nok(b.projectedMinor)} this month</div>
                </div>
              ))
            ) : <p className="empty small">No budgets set.</p>}
            <form className="row" style={{ marginTop: "0.8rem" }} onSubmit={(e) => { e.preventDefault(); void run(() => api("/api/finance/budgets", { body: { category: budget.category, monthlyNok: budget.monthlyNok === "" ? null : Number(budget.monthlyNok) } })); }}>
              <select aria-label="Budget category" value={budget.category} onChange={(e) => setBudget({ ...budget, category: e.target.value })} style={{ width: "auto", flex: 1 }}>
                {cats.filter((c) => c !== "income").map((c) => <option key={c} value={c}>{labels[c]}</option>)}
              </select>
              <input aria-label="Monthly budget in NOK" type="number" min={0} step={100} placeholder="NOK / month (empty removes)" value={budget.monthlyNok} onChange={(e) => setBudget({ ...budget, monthlyNok: e.target.value })} style={{ width: "auto", flex: 1 }} />
              <button className="btn" disabled={busy}>Set</button>
            </form>
          </section>
          <section className="card span-6" aria-labelledby="h-rec">
            <div className="card-head"><h3 id="h-rec">Recurring charges</h3><span className="tele">3+ months, similar amount</span></div>
            {i.recurring.length ? (
              <ul className="list-plain">
                {i.recurring.map((r) => <li key={r.key} className="item kv-row" style={{ justifyContent: "space-between" }}><span>{r.label} <span className="faint small">· {r.months} months</span></span><span className="mono">{nok(-r.typicalMinor)}</span></li>)}
              </ul>
            ) : <p className="empty small">None detected yet (needs 3+ months of data).</p>}
            {i.anomalies.length > 0 && (
              <>
                <h3 style={{ marginTop: "1rem" }}>Unusual</h3>
                <ul className="list-plain">
                  {i.anomalies.map((a) => <li key={a.id} className="item"><span className="mono small">{a.date}</span> {a.description} <strong className="mono">{nok(a.amountMinor)}</strong> <span className="faint small">· {a.reason}</span></li>)}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      <section className="card span-12" aria-labelledby="h-tx">
        <div className="card-head">
          <h3 id="h-tx">Transactions</h3>
          <select aria-label="Filter by category" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "auto", minHeight: 34 }}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c} value={c}>{labels[c]}</option>)}
          </select>
        </div>
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api("/api/finance", { body: { ...form, category: form.category || undefined } }); setForm({ ...form, amount: "", description: "" }); toast("Transaction added."); }); }}>
          <input aria-label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <input aria-label="Amount (negative = money out)" placeholder="Amount, e.g. -249,90" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <input aria-label="Description" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          <select aria-label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">Auto category</option>
            {cats.map((c) => <option key={c} value={c}>{labels[c]}</option>)}
          </select>
          <button className="btn" disabled={busy}>Add</button>
        </form>
        <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
          {shown.length ? (
            <table className="table">
              <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="num">Amount</th><th /></tr></thead>
              <tbody>
                {shown.slice(0, 150).map((t) => (
                  <tr key={t.id}>
                    <td className="mono small">{t.date}</td>
                    <td style={{ overflowWrap: "anywhere" }}>{t.description}</td>
                    <td>
                      <select aria-label={`Category for ${t.description}`} value={t.category} disabled={busy} onChange={(e) => void run(async () => { const r = await api<{ updated: number }>(`/api/finance/${t.id}`, { method: "PATCH", body: { category: e.target.value } }); toast(`Recategorised ${r.updated} transaction${r.updated === 1 ? "" : "s"}; future imports from this merchant follow.`); })}>
                        {cats.map((c) => <option key={c} value={c}>{labels[c]}</option>)}
                      </select>
                    </td>
                    <td className={`num mono${t.amountMinor > 0 ? " amount-in" : ""}`}>{nok(t.amountMinor, true)}</td>
                    <td><button className="btn btn-sm btn-ghost" aria-label={`Delete ${t.description}`} onClick={() => window.confirm("Delete this transaction?") && void run(() => api(`/api/finance/${t.id}`, { method: "DELETE" }))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="empty">No transactions{filter ? " in this category" : ""}.</p>}
        </div>
      </section>
    </div>
  );
}
