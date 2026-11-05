import { getSettings } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

/** Connect a private iCal calendar link (checked before it's saved). */
export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const { url } = await readJson<{ url?: unknown }>(req, 4000);
    const links = maverick.deps.agenda.links;
    if (!links) return json({ error: "Calendar links aren't available.", code: "unavailable" }, 400);
    const settings = await getSettings(maverick.db, maverick.cipher, user.id);
    return json({ link: await links.connect(user.id, url, settings.timezone) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    await maverick.deps.agenda.links?.disconnect(user.id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
