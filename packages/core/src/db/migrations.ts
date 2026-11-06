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
    id: "0005_focus_sessions",
    sql: `
      -- Focus timer sessions (Pomodoro-style), for accountability and statistics.
      CREATE TABLE focus_sessions (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        planned_minutes INTEGER NOT NULL CHECK (planned_minutes BETWEEN 1 AND 240),
        started_at      TIMESTAMPTZ NOT NULL,
        ended_at        TIMESTAMPTZ,
        completed       BOOLEAN NOT NULL DEFAULT false
      );
      CREATE INDEX focus_sessions_user_idx ON focus_sessions(user_id, started_at DESC);
    `,
  },
  {
    id: "0006_agent_engine_and_domains",
    sql: `
      -- Recurring missions. Created only by Oliver.
      CREATE TABLE automations (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template      TEXT NOT NULL,
        params_enc    TEXT NOT NULL,
        title_enc     TEXT NOT NULL,
        cadence       TEXT NOT NULL CHECK (cadence IN ('daily', 'weekdays', 'weekly')),
        at_time       TEXT NOT NULL,
        weekday       INTEGER CHECK (weekday BETWEEN 0 AND 6),
        enabled       BOOLEAN NOT NULL DEFAULT true,
        last_run_date TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX automations_user_idx ON automations(user_id);

      -- A mission: an objective, a fixed plan (steps), its execution and its report.
      CREATE TABLE missions (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template      TEXT NOT NULL,
        title_enc     TEXT NOT NULL,
        objective_enc TEXT NOT NULL,
        criteria_enc  TEXT,
        status        TEXT NOT NULL CHECK (status IN ('proposed', 'running', 'awaiting_approval', 'paused', 'completed', 'failed', 'cancelled')),
        mode          INTEGER NOT NULL CHECK (mode BETWEEN 1 AND 4),
        priority      INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
        deadline      DATE,
        goal_id       TEXT REFERENCES goals(id) ON DELETE SET NULL,
        source        TEXT NOT NULL CHECK (source IN ('user', 'voice', 'chat', 'automation')),
        automation_id TEXT REFERENCES automations(id) ON DELETE SET NULL,
        planner       TEXT NOT NULL DEFAULT 'template',
        report_enc    TEXT,
        cost_usd      NUMERIC(12, 6) NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at    TIMESTAMPTZ,
        finished_at   TIMESTAMPTZ,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX missions_user_idx ON missions(user_id, created_at DESC);
      CREATE INDEX missions_status_idx ON missions(status);

      CREATE TABLE mission_steps (
        id          TEXT PRIMARY KEY,
        mission_id  TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idx         INTEGER NOT NULL,
        agent       TEXT NOT NULL,
        tool        TEXT NOT NULL,
        title_enc   TEXT NOT NULL,
        input_enc   TEXT NOT NULL,
        risk        TEXT NOT NULL CHECK (risk IN ('read', 'low', 'medium', 'high')),
        status      TEXT NOT NULL CHECK (status IN ('pending', 'awaiting_approval', 'recommended', 'running', 'done', 'failed', 'skipped')),
        approved    BOOLEAN NOT NULL DEFAULT false,
        decision    TEXT,
        output_enc  TEXT,
        error_enc   TEXT,
        attempts    INTEGER NOT NULL DEFAULT 0,
        started_at  TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (mission_id, idx)
      );
      CREATE INDEX mission_steps_status_idx ON mission_steps(status);

      -- Execution log. Messages can contain personal details, so they're encrypted.
      CREATE TABLE agent_events (
        id          BIGSERIAL PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mission_id  TEXT REFERENCES missions(id) ON DELETE CASCADE,
        step_id     TEXT,
        level       TEXT NOT NULL CHECK (level IN ('info', 'success', 'warn', 'error')),
        kind        TEXT NOT NULL,
        message_enc TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX agent_events_user_idx ON agent_events(user_id, id DESC);

      ALTER TABLE tasks ADD COLUMN mission_id TEXT REFERENCES missions(id) ON DELETE SET NULL;
      ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check;
      ALTER TABLE tasks ADD CONSTRAINT tasks_source_check CHECK (source IN ('user', 'suggestion', 'agent'));

      -- Finance: only data Oliver enters or imports. Amounts in øre (1/100 NOK).
      CREATE TABLE finance_transactions (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        booked_on       DATE NOT NULL,
        amount_minor    BIGINT NOT NULL,
        currency        TEXT NOT NULL DEFAULT 'NOK',
        description_enc TEXT NOT NULL,
        category        TEXT NOT NULL,
        source          TEXT NOT NULL CHECK (source IN ('manual', 'csv')),
        import_hash     TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX finance_tx_user_idx ON finance_transactions(user_id, booked_on DESC);
      CREATE UNIQUE INDEX finance_tx_hash_idx ON finance_transactions(user_id, import_hash) WHERE import_hash IS NOT NULL;

      CREATE TABLE finance_budgets (
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category      TEXT NOT NULL,
        monthly_minor BIGINT NOT NULL CHECK (monthly_minor > 0),
        PRIMARY KEY (user_id, category)
      );

      -- Learned categorisation: "descriptions containing X are category Y".
      CREATE TABLE finance_rules (
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pattern_enc TEXT NOT NULL,
        pattern_key TEXT NOT NULL,
        category    TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, pattern_key)
      );

      -- Health & performance logs, entered by Oliver.
      CREATE TABLE health_entries (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        logged_on  DATE NOT NULL,
        kind       TEXT NOT NULL CHECK (kind IN ('workout', 'sleep', 'weight', 'energy')),
        value      NUMERIC(10, 2) NOT NULL,
        note_enc   TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX health_user_idx ON health_entries(user_id, logged_on DESC);

      -- Email drafts. Maverick never sends; Oliver hands them to his own mail app.
      CREATE TABLE drafts (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mission_id  TEXT REFERENCES missions(id) ON DELETE SET NULL,
        to_enc      TEXT NOT NULL,
        subject_enc TEXT NOT NULL,
        body_enc    TEXT NOT NULL,
        status      TEXT NOT NULL CHECK (status IN ('draft', 'handed_off', 'discarded')),
        written_by  TEXT NOT NULL CHECK (written_by IN ('model', 'template', 'user')),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX drafts_user_idx ON drafts(user_id, updated_at DESC);
    `,
  },
  {
    id: "0007_calendar_links",
    sql: `
      -- A private calendar link (iCal "secret address"): read-only, no Google Cloud setup.
      -- The link itself grants read access, so it is stored encrypted.
      CREATE TABLE calendar_links (
        user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        url_enc     TEXT NOT NULL,
        host        TEXT NOT NULL,
        calendar_name_enc TEXT,
        last_ok_at  TIMESTAMPTZ,
        last_error  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
  {
    id: "0008_task_library_and_digests",
    sql: `
      ALTER TABLE suggestions DROP CONSTRAINT IF EXISTS suggestions_source_check;
      ALTER TABLE suggestions ADD CONSTRAINT suggestions_source_check CHECK (source IN ('conversation', 'briefing', 'library'));

      -- How Oliver has answered each library task (drives what comes next).
      CREATE TABLE library_state (
        user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id          TEXT NOT NULL,
        shown_count      INTEGER NOT NULL DEFAULT 0,
        accepted_count   INTEGER NOT NULL DEFAULT 0,
        dismissed_count  INTEGER NOT NULL DEFAULT 0,
        never            BOOLEAN NOT NULL DEFAULT false,
        snoozed_until    DATE,
        last_period      TEXT,
        last_shown_at    TIMESTAMPTZ,
        last_accepted_at TIMESTAMPTZ,
        PRIMARY KEY (user_id, task_id)
      );

      -- Non-urgent notifications wait here and go out in batches (briefing, midday digest, check-in).
      CREATE TABLE notification_queue (
        id         BIGSERIAL PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL,
        title_enc  TEXT NOT NULL,
        body_enc   TEXT NOT NULL,
        url        TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        sent_at    TIMESTAMPTZ
      );
      CREATE INDEX notification_queue_pending_idx ON notification_queue(user_id) WHERE sent_at IS NULL;

      -- Once-a-day jobs (library picks, overnight preparation, midday digest), idempotent per local day.
      CREATE TABLE daily_runs (
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job        TEXT NOT NULL,
        local_date TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, job, local_date)
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
