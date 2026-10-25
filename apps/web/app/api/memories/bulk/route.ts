import type { MemoryCategory, Retention } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

/** POST { category, text, retention? }: one memory per line. */
export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const b = await readJson<{ category?: string; text?: string; retention?: string }>(req, 250_000);
    const res = await maverick.deps.memory.createMany(user.id, {
      category: String(b.category ?? "profile") as MemoryCategory,
      text: String(b.text ?? ""),
      retention: (b.retention || undefined) as Retention | undefined,
    });
    return json(res);
  } catch (err) {
    return errorResponse(err);
  }
}
