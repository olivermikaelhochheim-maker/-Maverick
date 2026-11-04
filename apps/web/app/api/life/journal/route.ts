import { errorResponse, json, readJson } from "@/lib/server";
import { lifeApi } from "@/lib/life";

export async function GET(req: Request) {
  try {
    const { life, user } = await lifeApi(req);
    const q = new URL(req.url).searchParams.get("q") ?? undefined;
    return json({ entries: await life.listEntries(user.id, { q, limit: 200 }) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { life, user, today } = await lifeApi(req);
    return json({ entry: await life.createEntry(user.id, await readJson(req), today) });
  } catch (err) {
    return errorResponse(err);
  }
}
