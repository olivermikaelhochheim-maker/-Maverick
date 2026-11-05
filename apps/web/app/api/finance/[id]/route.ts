import { apiUser, errorResponse, json, readJson } from "@/lib/server";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    const b = await readJson<{ category?: unknown; learn?: unknown }>(req);
    return json(await maverick.agent.finance.recategorize(user.id, (await params).id, b.category, b.learn !== false));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    await maverick.agent.finance.remove(user.id, (await params).id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
