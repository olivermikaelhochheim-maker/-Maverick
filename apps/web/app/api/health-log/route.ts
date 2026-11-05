import { localParts, getSettings } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const settings = await getSettings(maverick.db, maverick.cipher, user.id);
    const today = localParts(settings.timezone).date;
    const [trends, entries] = await Promise.all([maverick.agent.health.trends(user.id, today), maverick.agent.health.list(user.id)]);
    return json({ trends, entries: entries.slice(0, 100), today });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ entry: await maverick.agent.health.add(user.id, await readJson(req)) });
  } catch (err) {
    return errorResponse(err);
  }
}
