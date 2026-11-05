import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const q = new URL(req.url).searchParams;
    const after = Number(q.get("after") ?? 0) || undefined;
    return json({ events: await maverick.agent.events(user.id, { missionId: q.get("missionId") ?? undefined, limit: Number(q.get("limit") ?? 100) || 100, afterId: after }) });
  } catch (err) {
    return errorResponse(err);
  }
}
