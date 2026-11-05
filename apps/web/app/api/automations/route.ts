import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ automations: await maverick.agent.listAutomations(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ automation: await maverick.agent.createAutomation(user, await readJson(req)) });
  } catch (err) {
    return errorResponse(err);
  }
}
