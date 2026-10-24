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
  {
    id: "0002_chief_of_staff",
    sql: `
      -- Memory Vault. Content is encrypted; metadata stays queryable.
      CREATE TABLE memories (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category     TEXT NOT NULL CHECK (category IN ('profile','preference','goal','project','decision','episodic','ephemeral')),
        content_enc  TEXT NOT NULL,
        source       TEXT NOT NULL CHECK (source IN ('user','conversation','briefing','import')),
        source_ref   TEXT,
        confidence   REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
        retention    TEXT NOT NULL DEFAULT 'permanent' CHECK (retention IN ('permanent','1y','90d','30d','7d')),
        expires_at   TIMESTAMPTZ,
        pinned       BOOLEAN NOT NULL DEFAULT false,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at TIMESTAMPTZ
      );
      CREATE INDEX memories_user_idx ON memories(user_id, category);

      -- Which memories were given to the model for a reply, and why.
      CREATE TABLE message_context (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        memory_id  TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        reason     TEXT NOT NULL,
        PRIMARY KEY (message_id, memory_id)
      );

      CREATE TABLE goals (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title_enc   TEXT NOT NULL,
        detail_enc  TEXT,
        metric_enc  TEXT,
        horizon     TEXT NOT NULL DEFAULT 'other' CHECK (horizon IN ('1y','3y','5y','personal','other')),
        target_date DATE,
        status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','paused','dropped')),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE tasks (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        goal_id      TEXT REFERENCES goals(id) ON DELETE SET NULL,
        title_enc    TEXT NOT NULL,
        notes_enc    TEXT,
        priority     INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
        due_date     DATE,
        remind_at    TIMESTAMPTZ,
        reminded_at  TIMESTAMPTZ,
        status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dropped')),
        source       TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','suggestion')),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX tasks_user_status_idx ON tasks(user_id, status);
      CREATE INDEX tasks_remind_idx ON tasks(remind_at) WHERE reminded_at IS NULL AND status = 'open';

      -- Maverick proposes; Oliver decides. Nothing here takes effect until accepted.
      CREATE TABLE suggestions (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL CHECK (kind IN ('memory','task','goal','action')),
        title_enc   TEXT NOT NULL,
        body_enc    TEXT,
        payload_enc TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed','expired')),
        source      TEXT NOT NULL CHECK (source IN ('conversation','briefing')),
        source_ref  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at  TIMESTAMPTZ
      );
      CREATE INDEX suggestions_user_status_idx ON suggestions(user_id, status, created_at DESC);

      -- One row per scheduled briefing actually produced (unique = idempotent).
      CREATE TABLE briefings (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind            TEXT NOT NULL CHECK (kind IN ('morning','evening','weekly')),
        local_date      TEXT NOT NULL,
        conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
        status          TEXT NOT NULL CHECK (status IN ('done','skipped')),
        note            TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, kind, local_date)
      );

      CREATE TABLE push_subscriptions (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint_hash   TEXT NOT NULL UNIQUE,
        data_enc        TEXT NOT NULL,
        user_agent      TEXT,
        failures        INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_success_at TIMESTAMPTZ
      );

      CREATE TABLE notifications (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL,
        status     TEXT NOT NULL CHECK (status IN ('sent','failed','suppressed')),
        reason     TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX notifications_user_time_idx ON notifications(user_id, created_at);

      -- Connected accounts. Tokens are encrypted.
      CREATE TABLE integrations (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider          TEXT NOT NULL CHECK (provider IN ('google')),
        scopes            TEXT NOT NULL,
        account_email_enc TEXT,
        tokens_enc        TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','needs_reauth')),
        last_error        TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, provider)
      );
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
