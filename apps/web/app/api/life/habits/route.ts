import { errorResponse, json, readJson } from "@/lib/server";
import { lifeApi } from "@/lib/life";

export async function GET(req: Request) {
  try {
    const { life, user } = await lifeApi(req);
    return json({ habits: await life.listHabits(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { life, user, today } = await lifeApi(req);
    const body = await readJson(req);
    return json({ habit: await life.createHabit(user.id, { ...body, from: body.from ?? today } as Parameters<typeof life.createHabit>[1]) });
  } catch (err) {
    return errorResponse(err);
  }
}
