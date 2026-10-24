import { getSettings } from "@maverick/core";
import { apiUser, errorResponse, json } from "@/lib/server";

/** Send a test notification now (ignores quiet hours, since Oliver asked for it). */
export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const settings = await getSettings(maverick.db, maverick.cipher, user.id);
    const res = await maverick.notifier.notify(
      user.id,
      settings,
      { kind: "test", title: "Maverick", body: "Notifications are working.", url: "/settings" },
      new Date(),
      { ignoreQuietHours: true },
    );
    return json(res);
  } catch (err) {
    return errorResponse(err);
  }
}
