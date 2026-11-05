import { matchIntent } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

/** Route a typed or spoken command: a mission when it matches one, otherwise a conversation. */
export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const b = await readJson<{ text?: unknown; voice?: unknown }>(req);
    const text = typeof b.text === "string" ? b.text.trim().slice(0, 1000) : "";
    if (!text) return json({ error: "Say or type a command.", code: "bad_input" }, 400);
    const intent = matchIntent(text);
    if (!intent) return json({ route: "chat", text });
    const mission = await maverick.agent.create(user, { template: intent.template, params: intent.params, source: b.voice === true ? "voice" : "user" });
    maverick.agent.kick(user.id);
    return json({ route: "mission", mission: { id: mission.id, title: mission.title, steps: mission.steps.length } });
  } catch (err) {
    return errorResponse(err);
  }
}
