# Maverick architecture

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
   ├─ chat/        ChatService: validate → budget → route → context → stream (+ proposal tools) → meter → persist
   ├─ memory/      Memory Vault: categories, provenance, retention, selection with reasons
   ├─ planning/    goals and tasks, reminders
   ├─ suggestions  inbox: Maverick proposes, Oliver accepts/edits/dismisses
   ├─ context      snapshot of goals, tasks, calendar, inbox for the model
   ├─ briefing     morning / evening / weekly, model or free template
   ├─ scheduler    in-process, once a minute, idempotent, catch-up after sleep
   ├─ notify       Web Push with consent, quiet hours, daily cap, endpoint allowlist
   ├─ integrations Google OAuth (PKCE), read-only calendar, encrypted tokens; mock calendar
   ├─ export       everything, decrypted, as JSON
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
 Outbound calls: Anthropic API (when a key is set) · Google Calendar API (read-only, when connected) · push services (Apple/Google, when notifications are on)
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

## Data model additions (migration 0002)
`memories`, `message_context` (which memories fed which reply, and why), `goals`, `tasks`, `suggestions`, `briefings` (one per kind per local day), `push_subscriptions`, `notifications`, `integrations` (encrypted OAuth tokens).

## What is deliberately absent
Voice; any external write (email, calendar changes, purchases, posts, money); web browsing. Maverick's only tools propose items to its own inbox (ADR 0009).
