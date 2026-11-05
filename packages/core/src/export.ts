import type { Db } from "./db/types";
import type { FieldCipher } from "./util/crypto";
import type { ChatDeps } from "./chat/service";
import { ConversationStore } from "./chat/conversations";
import { getSettings } from "./settings";
import { listAudit } from "./audit";
import { audit } from "./audit";
import { FinanceStore } from "./finance";
import { HealthStore } from "./health";
import { DraftStore } from "./drafts";
import { MissionEngine } from "./agent/engine";

/** Everything Maverick holds about Oliver, decrypted, as one JSON document. */
export async function exportAll(db: Db, cipher: FieldCipher, deps: ChatDeps, user: { id: string; email: string; displayName: string }) {
  const conversations = new ConversationStore(db, cipher);
  const convs = await conversations.list(user.id, 10_000);
  const withMessages = [];
  for (const c of convs) withMessages.push({ ...c, messages: await conversations.messages(user.id, c.id, 100_000) });
  const usage = await db.query("SELECT provider, model, input_tokens, output_tokens, cost_usd, estimated, created_at FROM usage_events WHERE user_id = $1 ORDER BY created_at", [user.id]);
  const finance = new FinanceStore(db, cipher);
  // Read-only use of the engine (no provider calls): missions, automations and the execution log.
  const engine = new MissionEngine(db, cipher, { primary: null as never, mock: null as never, mode: "mock" }, deps, null);
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
    // File contents aren't included (they can be large); download them from Files.
    files: (await deps.files.list(user.id)).map((f) => ({ name: f.name, kind: f.kind, sizeBytes: f.sizeBytes, pages: f.pages, createdAt: f.createdAt })),
    finance: { transactions: await finance.list(user.id, { limit: 100_000 }), budgets: await finance.budgets(user.id) },
    health: await new HealthStore(db, cipher).list(user.id),
    drafts: await new DraftStore(db, cipher).list(user.id, true),
    missions: await engine.list(user.id, { limit: 10_000 }),
    automations: await engine.listAutomations(user.id),
    agentLog: await engine.events(user.id, { limit: 500 }),
    auditLog: await listAudit(db, user.id, 500),
  };
}
