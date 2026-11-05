import { apiUser, errorResponse, json, readJson } from "@/lib/server";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ draft: await maverick.agent.drafts.update(user.id, (await params).id, await readJson(req)) });
  } catch (err) {
    return errorResponse(err);
  }
}
