import type { Db } from "./db/types";
import type { FieldCipher } from "./util/crypto";
import type { ChatDeps } from "./chat/service";
import { ConversationStore } from "./chat/conversations";
import { getSettings } from "./settings";
import { listAudit } from "./audit";
import { audit } from "./audit";

/** Everything Maverick holds about Oliver, decrypted, as one JSON document. */
export async function exportAll(db: Db, cipher: FieldCipher, deps: ChatDeps, user: { id: string; email: string; displayName: string }) {
  const conversations = new ConversationStore(db, cipher);
  const convs = await conversations.list(user.id, 10_000);
  const withMessages = [];
  for (const c of convs) withMessages.push({ ...c, messages: await conversations.messages(user.id, c.id, 100_000) });
  const usage = await db.query("SELECT provider, model, input_tokens, output_tokens, cost_usd, estimated, created_at FROM usage_events WHERE user_id = $1 ORDER BY created_at", [user.id]);
  await audit(db, { userId: user.id, actor: "user", action: "data.exported" });
  return {
    exportedAt: new Date().toISOString(),
    format: "maverick-export-v1",
    account: { email: user.email, displayName: user.displayName },
    settings: await getSettings(db, cipher, user.id),
    memories: await deps.memory.list(user.id),
    goals: await deps.planning.listGoals(user.id),
    tasks: await deps.planning.listTasks(user.id, { status: "all", limit: 100_000 }),
    suggestions: await deps.suggestions.list(user.id, "all", 100_000),
    conversations: withMessages,
    usage: usage.rows,
    auditLog: await listAudit(db, user.id, 500),
  };
}
