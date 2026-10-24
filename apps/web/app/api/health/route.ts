import { getMaverick, json } from "@/lib/server";

export async function GET() {
  try {
    const m = await getMaverick();
    await m.db.query("SELECT 1");
    return json({ ok: true, db: m.db.kind, llm: m.providers.mode });
  } catch {
    return json({ ok: false }, 503);
  }
}
