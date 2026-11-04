import { errorResponse, json, readJson } from "@/lib/server";
import { lifeApi } from "@/lib/life";

/** Body: { date, flag: "rest" | "sick" | null } */
export async function PUT(req: Request) {
  try {
    const { life, user, today } = await lifeApi(req);
    const b = await readJson(req);
    await life.setDayFlag(user.id, b.date, b.flag ?? null, today);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
