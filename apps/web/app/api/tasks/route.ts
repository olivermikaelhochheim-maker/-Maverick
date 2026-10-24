import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const status = new URL(req.url).searchParams.get("status") === "all" ? "all" : "open";
    return json({ tasks: await maverick.deps.planning.listTasks(user.id, { status }) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ task: await maverick.deps.planning.createTask(user.id, (await readJson(req)) as { title: unknown }) });
  } catch (err) {
    return errorResponse(err);
  }
}
