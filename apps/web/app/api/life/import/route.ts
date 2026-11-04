import { errorResponse, json, readJson } from "@/lib/server";
import { lifeApi } from "@/lib/life";

/** Import a Daybook export (or a Maverick export's Life section). Only into an empty Life. */
export async function POST(req: Request) {
  try {
    const { life, user } = await lifeApi(req);
    return json({ imported: await life.importAll(user.id, await readJson(req, 20_000_000)) });
  } catch (err) {
    return errorResponse(err);
  }
}
