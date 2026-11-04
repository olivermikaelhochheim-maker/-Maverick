import { errorResponse, json, readJson } from "@/lib/server";
import { lifeApi } from "@/lib/life";

/** Body: { habitId, date, status: "done" | "missed" | "rest" | "sick" | null } */
export async function PUT(req: Request) {
  try {
    const { life, user, today } = await lifeApi(req);
    const b = await readJson(req);
    await life.setLog(user.id, b.habitId, b.date, b.status ?? null, today);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
