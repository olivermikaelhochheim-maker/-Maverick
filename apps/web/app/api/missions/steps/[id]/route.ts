import { apiUser, errorResponse, json, readJson } from "@/lib/server";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    const { action } = await readJson<{ action?: string }>(req);
    const id = (await params).id;
    if (action === "approve" || action === "run") return json({ mission: await maverick.agent.approve(user, id) });
    if (action === "reject") return json({ mission: await maverick.agent.reject(user, id) });
    return json({ error: "Unknown action.", code: "bad_input" }, 400);
  } catch (err) {
    return errorResponse(err);
  }
}
