import type { Db } from "./types";

/**
 * Forward-only schema migrations. Never edit a migration that has shipped;
 * add a new one instead.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "0001_init",
    sql: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        display_name  TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ
      );

      -- Session tokens are stored only as SHA-256 hashes.
      CREATE TABLE sessions (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at   TIMESTAMPTZ NOT NULL,
        user_agent   TEXT,
        ip_hash      TEXT
      );
      CREATE INDEX sessions_user_idx ON sessions(user_id);

      CREATE TABLE auth_attempts (
        id         BIGSERIAL PRIMARY KEY,
        key        TEXT NOT NULL,
        success    BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX auth_attempts_key_idx ON auth_attempts(key, created_at);

      CREATE TABLE settings (
        user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data       JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Titles and message content are encrypted at the application layer.
      CREATE TABLE conversations (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title_enc  TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX conversations_user_idx ON conversations(user_id, updated_at DESC);

      CREATE TABLE messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content_enc     TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'partial', 'error')),
        provider        TEXT,
        model           TEXT,
        tier            TEXT,
        route_reason    TEXT,
        input_tokens    INTEGER,
        output_tokens   INTEGER,
        cost_usd        DOUBLE PRECISION,
        latency_ms      INTEGER,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at);

      -- One row per paid (or mock) model call. This is the budget ledger.
      CREATE TABLE usage_events (
        id                 TEXT PRIMARY KEY,
        user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conversation_id    TEXT,
        provider           TEXT NOT NULL,
        model              TEXT NOT NULL,
        kind               TEXT NOT NULL DEFAULT 'llm',
        input_tokens       INTEGER NOT NULL DEFAULT 0,
        output_tokens      INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd           DOUBLE PRECISION NOT NULL DEFAULT 0,
        estimated          BOOLEAN NOT NULL DEFAULT false,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX usage_events_user_time_idx ON usage_events(user_id, created_at);

      -- Append-only record of security-relevant and state-changing actions.
      CREATE TABLE audit_log (
        id         BIGSERIAL PRIMARY KEY,
        user_id    TEXT,
        actor      TEXT NOT NULL CHECK (actor IN ('user', 'system', 'assistant')),
        action     TEXT NOT NULL,
        target     TEXT,
        details    JSONB NOT NULL DEFAULT '{}'::jsonb,
        ip_hash    TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX audit_log_user_time_idx ON audit_log(user_id, created_at DESC);
    `,
  },
];

export async function migrate(db: Db): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const { rows } = await db.query<{ id: string }>("SELECT id FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.id));
  const ran: string[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
    });
    ran.push(m.id);
  }
  return ran;
}
