import { apiUser, errorResponse, json, readJson } from "@/lib/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    const { id } = await params;
    return json({ messages: await maverick.chat.conversations.messages(user.id, id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    const { id } = await params;
    const body = await readJson<{ title?: string }>(req);
    await maverick.chat.conversations.rename(user.id, id, String(body.title ?? ""));
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    const { id } = await params;
    await maverick.chat.conversations.delete(user.id, id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
