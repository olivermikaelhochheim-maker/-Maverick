import type { MemoryCategory, Retention } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    const { id } = await params;
    const b = await readJson<{ content?: string; category?: string; retention?: string; pinned?: boolean }>(req);
    const memory = await maverick.deps.memory.update(user.id, id, {
      content: typeof b.content === "string" ? b.content : undefined,
      category: b.category as MemoryCategory | undefined,
      retention: b.retention as Retention | undefined,
      pinned: typeof b.pinned === "boolean" ? b.pinned : undefined,
    });
    return json({ memory });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { maverick, user } = await apiUser(req);
    await maverick.deps.memory.delete(user.id, (await params).id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
