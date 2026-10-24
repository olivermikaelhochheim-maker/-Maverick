import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ goals: await maverick.deps.planning.listGoals(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const b = await readJson(req);
    return json({ goal: await maverick.deps.planning.createGoal(user.id, b as { title: unknown }) });
  } catch (err) {
    return errorResponse(err);
  }
}
