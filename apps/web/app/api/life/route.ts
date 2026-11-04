import { errorResponse, json } from "@/lib/server";
import { lifeApi } from "@/lib/life";

export async function GET(req: Request) {
  try {
    const { life, user, today } = await lifeApi(req);
    return json({ overview: await life.overview(user.id, today) });
  } catch (err) {
    return errorResponse(err);
  }
}
