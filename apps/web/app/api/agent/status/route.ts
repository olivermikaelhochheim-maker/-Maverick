import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const [status, approvals, events] = await Promise.all([
      maverick.agent.status(user.id),
      maverick.agent.approvals(user.id),
      maverick.agent.events(user.id, { limit: 12 }),
    ]);
    return json({ status, approvals, events, live: maverick.providers.mode === "live", calendar: maverick.calendarMode });
  } catch (err) {
    return errorResponse(err);
  }
}
