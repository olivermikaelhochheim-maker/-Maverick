import { CATEGORY_LABELS, type MemoryCategory, type Retention } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ memories: await maverick.deps.memory.list(user.id), categories: CATEGORY_LABELS });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const b = await readJson<{ category?: string; content?: string; retention?: string; pinned?: boolean }>(req);
    const memory = await maverick.deps.memory.create(user.id, {
      category: String(b.category ?? "profile") as MemoryCategory,
      content: String(b.content ?? ""),
      retention: b.retention as Retention | undefined,
      pinned: b.pinned === true,
      source: "user",
    });
    return json({ memory });
  } catch (err) {
    return errorResponse(err);
  }
}
