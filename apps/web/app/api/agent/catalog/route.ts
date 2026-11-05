import { TEMPLATES, toolCatalog, AGENTS, MODE_NAMES, MODE_SUMMARIES } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    void user;
    return json({
      templates: TEMPLATES.map((t) => ({ id: t.id, label: t.label, description: t.description, params: t.params })),
      tools: toolCatalog(maverick.agent.env),
      agents: AGENTS,
      modes: MODE_NAMES,
      modeSummaries: MODE_SUMMARIES,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
