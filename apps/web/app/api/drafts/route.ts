import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ drafts: await maverick.agent.drafts.list(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ draft: await maverick.agent.drafts.create(user.id, await readJson(req), { writtenBy: "user" }) });
  } catch (err) {
    return errorResponse(err);
  }
}
