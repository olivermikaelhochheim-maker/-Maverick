import { localParts, getSettings } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const settings = await getSettings(maverick.db, maverick.cipher, user.id);
    const month = new URL(req.url).searchParams.get("month") ?? undefined;
    const today = localParts(settings.timezone).date;
    const [intel, transactions] = await Promise.all([maverick.agent.finance.intelligence(user.id, today), maverick.agent.finance.list(user.id, { month, limit: 300 })]);
    return json({ intel, transactions, today });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ transaction: await maverick.agent.finance.add(user.id, await readJson(req)) });
  } catch (err) {
    return errorResponse(err);
  }
}
