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
  {
    id: "0003_two_factor_and_app_secrets",
    sql: `
      -- Two-step login (TOTP). The secret is encrypted; recovery codes are stored only as hashes.
      ALTER TABLE users ADD COLUMN totp_secret_enc TEXT;
      ALTER TABLE users ADD COLUMN totp_pending_enc TEXT;
      ALTER TABLE users ADD COLUMN totp_enabled_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN totp_last_step BIGINT NOT NULL DEFAULT -1;
      ALTER TABLE users ADD COLUMN recovery_codes TEXT NOT NULL DEFAULT '[]';

      -- A session created by a correct password but still waiting for the 6-digit code.
      ALTER TABLE sessions ADD COLUMN mfa_verified BOOLEAN NOT NULL DEFAULT true;

      -- Server-generated secrets (e.g. Web Push keys), encrypted with the data key.
      CREATE TABLE app_secrets (
        name       TEXT PRIMARY KEY,
        value_enc  TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
  {
    id: "0004_files",
    sql: `
      -- Files Oliver gives Maverick. The original bytes and any extracted text are encrypted.
      CREATE TABLE files (
        id             TEXT PRIMARY KEY,
        user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name_enc       TEXT NOT NULL,
        kind           TEXT NOT NULL CHECK (kind IN ('pdf', 'image', 'text', 'docx')),
        media_type     TEXT NOT NULL,
        size_bytes     INTEGER NOT NULL,
        sha256         TEXT NOT NULL,
        pages          INTEGER,
        token_estimate INTEGER NOT NULL,
        content_enc    BYTEA NOT NULL,
        text_enc       TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX files_user_idx ON files(user_id, created_at DESC);

      -- Which files were attached to which message.
      CREATE TABLE message_files (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        PRIMARY KEY (message_id, file_id)
      );
      CREATE INDEX message_files_file_idx ON message_files(file_id);
    `,
  },
  {
    id: "0005_life_dashboard",
    sql: `
      -- Habits. Titles and notes are encrypted; area, ordering and reminder time stay queryable.
      CREATE TABLE habits (
        id                 TEXT PRIMARY KEY,
        user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        goal_id            TEXT REFERENCES goals(id) ON DELETE SET NULL,
        title_enc          TEXT NOT NULL,
        minimum_enc        TEXT,
        why_enc            TEXT,
        area               TEXT NOT NULL,
        remind_time        TEXT,
        last_reminded_date TEXT,
        sort               INTEGER NOT NULL DEFAULT 0,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX habits_user_idx ON habits(user_id, sort);

      -- Schedule history. A change adds a version from a date, so past weeks keep their old schedule and score.
      CREATE TABLE habit_versions (
        habit_id   TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        valid_from TEXT NOT NULL,
        kind       TEXT NOT NULL CHECK (kind IN ('days','weekly')),
        days       TEXT NOT NULL DEFAULT '',
        target     INTEGER NOT NULL DEFAULT 0 CHECK (target BETWEEN 0 AND 7),
        status     TEXT NOT NULL CHECK (status IN ('active','paused','archived')),
        PRIMARY KEY (habit_id, valid_from)
      );

      -- One row per habit per local day that has been logged. No row = not logged (distinct from missed).
      CREATE TABLE habit_logs (
        habit_id   TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date TEXT NOT NULL,
        status     TEXT NOT NULL CHECK (status IN ('done','missed','rest','sick')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (habit_id, local_date)
      );
      CREATE INDEX habit_logs_user_date_idx ON habit_logs(user_id, local_date);

      -- Whole-day adjustments: planned rest or illness excuses that day's day-habits.
      CREATE TABLE day_flags (
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date TEXT NOT NULL,
        flag       TEXT NOT NULL CHECK (flag IN ('rest','sick')),
        PRIMARY KEY (user_id, local_date)
      );

      -- Journal. Everything written, including mood/energy ratings, is encrypted in data_enc.
      CREATE TABLE journal_entries (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date TEXT NOT NULL,
        data_enc   TEXT NOT NULL,
        ai_allowed BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX journal_user_date_idx ON journal_entries(user_id, local_date DESC);
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
