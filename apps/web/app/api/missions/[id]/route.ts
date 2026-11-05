import { apiUser, errorResponse, json, readJson } from "@/lib/server";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    const m = await maverick.agent.get(user.id, (await params).id);
    if (!m) return json({ error: "Mission not found.", code: "not_found" }, 404);
    return json({ mission: m, events: await maverick.agent.events(user.id, { missionId: m.id, limit: 200 }) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    const { action } = await readJson<{ action?: string }>(req);
    const id = (await params).id;
    if (action === "launch" || action === "resume") return json({ mission: await maverick.agent.launch(user, id) });
    if (action === "pause") return json({ mission: await maverick.agent.pause(user, id) });
    if (action === "cancel") return json({ mission: await maverick.agent.cancel(user, id) });
    return json({ error: "Unknown action.", code: "bad_input" }, 400);
  } catch (err) {
    return errorResponse(err);
  }
}
