import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const body = await readJson<{ halted?: unknown }>(req);
    if (typeof body.halted !== "boolean") return json({ error: "halted must be true or false", code: "bad_input" }, 400);
    await maverick.agent.setHalted(user, body.halted);
    return json({ status: await maverick.agent.status(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
