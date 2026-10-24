import { getSettings, getSpend, getUsageBreakdown } from "@maverick/core";
import { apiUser, errorResponse, json } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const settings = await getSettings(maverick.db, maverick.cipher, user.id);
    return json({
      spend: await getSpend(maverick.db, user.id, settings),
      breakdown: await getUsageBreakdown(maverick.db, user.id),
      mode: maverick.providers.mode,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
