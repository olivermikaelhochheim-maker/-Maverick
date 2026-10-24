import { randomBytes } from "node:crypto";
import { openPglite, migrate, type Db } from "../src/db";
import { createInitialUser, type User } from "../src/auth";
import { FieldCipher } from "../src/util/crypto";
import { ChatService } from "../src/chat/service";
import { MockProvider } from "../src/llm/mock";
import type { LLMProvider, ProviderSet } from "../src/llm";

export const SETUP_CODE = "test-setup-code";
export const PASSWORD = "correct horse battery staple";

export async function freshDb(): Promise<Db> {
  const db = await openPglite(); // in-memory
  await migrate(db);
  return db;
}

export async function seedUser(db: Db): Promise<User> {
  return createInitialUser(db, { email: "oliver@example.com", displayName: "Oliver", password: PASSWORD, setupCode: SETUP_CODE }, SETUP_CODE);
}

export function testCipher() {
  return new FieldCipher(randomBytes(32).toString("base64"));
}

/** A ProviderSet whose "live" provider is a mock with real model pricing applied by the service. */
export function liveProviders(primary: LLMProvider = new MockProvider({ delayMs: 0 })): ProviderSet {
  return { primary, mock: new MockProvider({ delayMs: 0 }), mode: "live" };
}

export async function setup(primary?: LLMProvider) {
  const db = await freshDb();
  const user = await seedUser(db);
  const cipher = testCipher();
  const chat = new ChatService(db, cipher, liveProviders(primary));
  return { db, user, cipher, chat };
}

export async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of gen) out.push(x);
  return out;
}
