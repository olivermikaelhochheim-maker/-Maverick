# ADR 0002: Embedded Postgres (PGlite) locally, PostgreSQL server in the cloud

Status: Accepted (2026-10-24)

## Context
The brief specifies PostgreSQL with pgvector. Installing and running a database server (Docker, Postgres.app, Homebrew) is a big hurdle for a non-programmer.

## Decision
- Default: **PGlite**, a real PostgreSQL 17 engine compiled to WebAssembly that runs inside the Maverick process. Data lives in `data/pglite/`. Nothing to install.
- When `DATABASE_URL` is set: a normal PostgreSQL server via `pg` (Neon, Supabase, Postgres.app).
- Both sit behind a small `Db` interface (`query`, `exec`, `transaction`). All SQL is plain Postgres SQL and runs unchanged on both.
- Migrations: forward-only SQL in `packages/core/src/db/migrations.ts`, applied automatically at startup.

## Consequences
- PGlite allows **one process at a time** on a data folder. Don't run two copies of Maverick at once.
- pgvector: PGlite ships it as an extension (`@electric-sql/pglite/vector`); hosted Postgres providers have it built in. It gets enabled in Phase 3 with the memory schema. Not needed before.
- Message content is encrypted at the application layer (ADR 0005), so the database can't do full-text search over it. Phase 3 needs a design decision here (e.g. embeddings of approved memories only).
