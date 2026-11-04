import { errorResponse, json } from "@/lib/server";
import { lifeApi } from "@/lib/life";

export async function GET(req: Request) {
  try {
    const { life, user, today } = await lifeApi(req);
    return json({ history: await life.history(user.id, today, 8), habits: await life.listHabits(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
