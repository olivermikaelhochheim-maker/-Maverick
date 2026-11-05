import { apiUser, errorResponse, json, readJson } from "@/lib/server";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ automation: await maverick.agent.updateAutomation(user, (await params).id, await readJson(req)) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    await maverick.agent.deleteAutomation(user, (await params).id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
