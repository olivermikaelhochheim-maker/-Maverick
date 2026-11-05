import { apiUser, errorResponse, json, readJson } from "@/lib/server";
type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    await maverick.agent.health.remove(user.id, (await params).id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
