import { getSettings } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const settings = await getSettings(maverick.db, maverick.cipher, user.id);
    return json(await maverick.library.overview(user, settings));
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST { action: "suggest", id } · { action: "restore", id } · { action: "run" } (today's picks, within the daily limit) */
export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const b = await readJson<{ action?: string; id?: string }>(req);
    const settings = await getSettings(maverick.db, maverick.cipher, user.id);
    if (b.action === "suggest" && typeof b.id === "string") {
      await maverick.library.suggestNow(user, settings, b.id);
      return json({ ok: true });
    }
    if (b.action === "restore" && typeof b.id === "string") {
      await maverick.library.restore(user.id, b.id);
      return json({ ok: true });
    }
    if (b.action === "run") {
      const picked = await maverick.library.run(user, settings);
      return json({ picked: picked.map((t) => ({ id: t.id, title: t.title })) });
    }
    return json({ error: "Unknown action.", code: "bad_input" }, 400);
  } catch (err) {
    return errorResponse(err);
  }
}
