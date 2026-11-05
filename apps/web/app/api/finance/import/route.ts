import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const { text } = await readJson<{ text?: unknown }>(req, 2_200_000);
    if (typeof text !== "string" || !text.trim()) return json({ error: "The file is empty.", code: "bad_input" }, 400);
    return json({ result: await maverick.agent.finance.importCsv(user.id, text) });
  } catch (err) {
    return errorResponse(err);
  }
}
