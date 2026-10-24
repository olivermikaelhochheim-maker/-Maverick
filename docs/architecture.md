# Maverick architecture (Phase 1)

```
 iPhone Safari / Mac browser (PWA)
        │  HTTPS (Tailscale) or LAN HTTP
        ▼
 apps/web: Next.js 16
   ├─ pages: Command Center, Conversation, Usage, Security, Settings, Login, Setup
   └─ /api/*: thin route handlers (auth, origin check, JSON/stream I/O)
        │
        ▼
 packages/core (all logic, unit-tested)
   ├─ auth/        password hashing, sessions, lockout, single-user setup
   ├─ chat/        ChatService: validate → budget → route → stream → meter → persist
   ├─ llm/         LLMProvider interface · AnthropicProvider · MockProvider · catalog & prices · router
   ├─ budget/      spend ledger, hard/soft/daily limits, max_tokens clamping
   ├─ settings.ts  encrypted settings document with validation
   ├─ audit.ts     append-only audit log (redacted)
   ├─ db/          Db interface · PGlite (embedded) or PostgreSQL · migrations
   └─ util/        AES-GCM field encryption · secrets (env/Keychain) · redacting logger
        │
        ▼
 PGlite data folder (data/pglite)  or  PostgreSQL (DATABASE_URL)
        │
 Anthropic API (only outbound call; only when a key is configured)
```

## One chat turn
1. Browser POSTs `/api/chat` with text. Server checks session and Origin.
2. `ChatService.send`: loads settings, computes month/day spend.
3. Router picks a tier (and says why). The budget planner refuses or clamps `max_tokens`.
4. The user turn is stored (encrypted). History is windowed to the token budget.
5. Provider streams text. The server relays NDJSON events (`meta`, `delta`…, `done`/`error`).
6. Usage is recorded in the ledger. The reply is stored with model, cost and latency.
7. On Stop/disconnect: the provider call is aborted, the partial reply is saved, and the cost is charged as an estimate.

## Data model (migration 0001)
`users`, `sessions` (hashed tokens), `auth_attempts`, `settings` (encrypted JSON), `conversations` (encrypted title), `messages` (encrypted content + model/cost metadata), `usage_events` (ledger), `audit_log`.

## What is deliberately absent in Phase 1
No tools, integrations, memory, scheduling, voice or notifications. The system prompt tells the model it has no tools, so it doesn't claim actions it can't take.
