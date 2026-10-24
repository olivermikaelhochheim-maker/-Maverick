import { listAudit } from "@maverick/core";
import { apiUser, errorResponse, json } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ entries: await listAudit(maverick.db, user.id, 200) });
  } catch (err) {
    return errorResponse(err);
  }
}
