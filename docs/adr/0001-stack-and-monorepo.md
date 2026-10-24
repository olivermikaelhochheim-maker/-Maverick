# ADR 0001: TypeScript monorepo, Next.js app, API inside Next.js for Phase 1

Status: Accepted (2026-10-24)

## Context
The brief asks for a pnpm TypeScript monorepo with a Next.js PWA, a Node.js API, a job worker, and PostgreSQL + pgvector. Oliver doesn't program, so every extra process is another thing that can fail at startup.

## Decision
- `packages/core`: all business logic (auth, budget, chat, model providers, storage). Framework-free and unit-tested.
- `apps/web`: Next.js 16 app. Its route handlers under `app/api/*` are the API. They are thin wrappers that call `@maverick/core`.
- No separate API server and no worker in Phase 1. Nothing scheduled exists yet, so a worker would be idle code.

## Deviation from the brief, and why
The brief lists a standalone Node.js API. One process (Next.js) is enough today and halves setup and failure modes. Because all logic lives in `core`, extracting a standalone API later means writing new route wrappers, not moving business logic.

## Revisit when
- Phase 3 adds reminders and briefings: add `apps/worker` (scheduler + queue on Postgres, e.g. pg-boss or graphile-worker).
- A native SwiftUI client needs an API that doesn't depend on Next.js deployment.
