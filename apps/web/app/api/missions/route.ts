import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const status = new URL(req.url).searchParams.get("status");
    const filter = status === "active" ? (["running", "awaiting_approval", "paused", "proposed"] as const) : undefined;
    return json({ missions: await maverick.agent.list(user.id, { status: filter ? [...filter] : undefined, limit: 100 }) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const b = await readJson<{ template?: string; params?: Record<string, string>; objective?: string; mode?: number; priority?: number; deadline?: string; propose?: boolean; source?: string }>(req);
    const source = b.source === "voice" ? "voice" : "user";
    const mission = await maverick.agent.create(user, { template: b.template, params: b.params, objective: b.objective, mode: b.mode, priority: b.priority, deadline: b.deadline, propose: b.propose === true, source });
    if (mission.status === "running") maverick.agent.kick(user.id);
    return json({ mission });
  } catch (err) {
    return errorResponse(err);
  }
}
