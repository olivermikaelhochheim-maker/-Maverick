import { UserFacingError } from "@maverick/core";
import { errorResponse, json, readJson } from "@/lib/server";
import { lifeApi } from "@/lib/life";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { life, user } = await lifeApi(req);
    const entry = await life.getEntry(user.id, (await params).id);
    if (!entry) throw new UserFacingError("Entry not found.", "not_found", 404);
    return json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { life, user, today } = await lifeApi(req);
    return json({ entry: await life.updateEntry(user.id, (await params).id, await readJson(req), today) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { life, user } = await lifeApi(req);
    await life.deleteEntry(user.id, (await params).id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
