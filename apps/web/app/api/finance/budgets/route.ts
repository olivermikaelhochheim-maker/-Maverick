import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const b = await readJson<{ category?: unknown; monthlyNok?: unknown }>(req);
    await maverick.agent.finance.setBudget(user.id, b.category, b.monthlyNok);
    return json({ budgets: await maverick.agent.finance.budgets(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
