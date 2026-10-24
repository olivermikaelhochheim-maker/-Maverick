import { openDatabase, type Db } from "./db";
import { FieldCipher } from "./util/crypto";
import { getSecret } from "./util/secrets";
import { createProviders, type ProviderSet } from "./llm";
import { ChatService } from "./chat/service";

export interface Maverick {
  db: Db;
  cipher: FieldCipher;
  providers: ProviderSet;
  chat: ChatService;
}

/** Wire up the app: database, encryption, model providers, chat. */
export async function createMaverick(
  opts: { db?: Db; dataKey?: string; providers?: ProviderSet } = {},
): Promise<Maverick> {
  const dataKey = opts.dataKey ?? getSecret("MAVERICK_DATA_KEY");
  if (!dataKey) {
    throw new Error("MAVERICK_DATA_KEY is missing. Run `pnpm configure` from the project folder first.");
  }
  const cipher = new FieldCipher(dataKey);
  const db = opts.db ?? (await openDatabase());
  const providers = opts.providers ?? createProviders();
  return { db, cipher, providers, chat: new ChatService(db, cipher, providers) };
}
