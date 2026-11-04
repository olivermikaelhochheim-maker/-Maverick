import { errorResponse, json, readJson } from "@/lib/server";
import { lifeApi } from "@/lib/life";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { life, user } = await lifeApi(req);
    return json({ habit: await life.updateHabit(user.id, (await params).id, await readJson(req)) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { life, user } = await lifeApi(req);
    await life.deleteHabit(user.id, (await params).id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
