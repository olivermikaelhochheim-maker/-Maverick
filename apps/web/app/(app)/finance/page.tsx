import { FINANCE_CATEGORY_LABELS, getSettings, localParts } from "@maverick/core";
import { FinanceView } from "@/components/Finance";
import { getMaverick, requireUser } from "@/lib/server";

export default async function Finance() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const today = localParts(settings.timezone).date;
  const [intel, transactions] = await Promise.all([m.agent.finance.intelligence(user.id, today), m.agent.finance.list(user.id, { limit: 300 })]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">07 · Finance agent</span>
          <h1>Finance</h1>
          <p>Spending, budgets, recurring charges and anything unusual, from your own bank exports. Read-only: nothing can be paid or moved.</p>
        </div>
      </div>
      <FinanceView initial={JSON.parse(JSON.stringify({ intel, transactions, today }))} labels={FINANCE_CATEGORY_LABELS} />
    </div>
  );
}
