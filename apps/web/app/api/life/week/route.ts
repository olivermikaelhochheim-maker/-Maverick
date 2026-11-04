import { errorResponse, json } from "@/lib/server";
import { lifeApi } from "@/lib/life";

export async function GET(req: Request) {
  try {
    const { life, user, today } = await lifeApi(req);
    const monday = new URL(req.url).searchParams.get("monday") ?? today;
    return json({ ...(await life.week(user.id, monday, today)), today });
  } catch (err) {
    return errorResponse(err);
  }
}
