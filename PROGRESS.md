# Maverick: progress log

## Status: Phase 0 + Phase 1 built and tested (mock mode). Oliver's answers applied. Awaiting approval of the next milestone.

Last updated: 2026-10-24

---

## Completed

### Phase 0: Discovery & scaffolding
- pnpm TypeScript monorepo: `packages/core` (logic) + `apps/web` (Next.js 16 PWA)
- `pnpm configure`: generates the encryption key and setup code, stores secrets in the macOS Keychain (or a 600-permission `.env`), optional API key
- `pnpm check`: plain-English install health check
- Docs: architecture, threat model, budget model, 7 architecture decision records (`docs/adr/`)
- Free offline **mock mode**, so the whole app runs and demos with no API key

### Phase 1: Conversational MVP
- Single-user account: first-run setup protected by a setup code; scrypt passwords; hashed server-side sessions; lockout; per-device sign-out; password change
- Streaming text chat with conversation history, rename and delete; Stop button / Esc interrupts
- Model abstraction (`LLMProvider`) with an Anthropic provider (official SDK, streaming, prompt caching, server-side refusal fallback) and a mock provider
- Cost-aware routing: Haiku 5.5 for quick exchanges, Sonnet 5.5 for analysis, Opus 5.5 on "Think deeper". Each reply shows its model, the reason and the cost.
- Budget: per-call cost ledger; hard monthly + daily caps enforced *before* any call; `max_tokens` clamped to the remaining budget; soft limit switches to the cheapest model; interrupted calls charged at an estimate
- Encryption at rest (AES-256-GCM) for messages, titles and settings
- Audit log, redacted structured logs, security headers (CSP, frame-deny, microphone disabled), CSRF origin checks
- Screens: Command Center, Conversation, Usage & Budget, Security, Settings, plus locked roadmap items (Memory Vault, Projects, Zorza CEO) that are visibly marked as later phases
- Responsive dark navy/cyan UI, circular status orb, reduced-motion support, keyboard navigation, skip link, iPhone safe areas, Add-to-Home-Screen manifest

## Test results (2026-10-24, run in a Linux cloud container)
| Suite | Result |
|---|---|
| TypeScript typecheck (core + web) | ✅ pass |
| Core unit + integration (Vitest, real embedded Postgres) | ✅ 56 / 56 |
| Browser end-to-end (Playwright, production build; iPhone 15 + desktop) | ✅ 21 passed, 1 skipped by design (desktop run reuses the account the iPhone run created) |

Covered: encryption and tamper detection, password and session lifecycle, lockout (incl. rotating IPs), budget refusal/clamping/soft-downgrade, routing, settings validation and encryption at rest, chat persistence, history windowing, Stop mid-reply (partial saved, cost recorded), provider failures, prompt-injection boundary, CSRF block, security headers, no sideways scrolling on any page at iPhone width.

Bugs the tests caught and that are now fixed:
1. Pressing Stop abandoned the server-side chat pipeline, so the partial reply was never saved and **the call's cost was never recorded** (a budget leak).
2. A Settings number field had a step value that made the browser silently refuse to save.
3. Long audit-log entries made pages scroll sideways on iPhone.

## ⚠️ Not yet verified
- **Live Claude calls.** No API key was available in the build environment. The Anthropic provider type-checks against the official SDK, but its first real request happens on your Mac. First thing to do after adding a key: send one message on each tier (normal message, an analytical question, and one with "Think deeper") and confirm replies and costs appear.
- **Running on macOS itself** (built and tested on Linux). The Keychain integration is macOS-only and untested here; the `.env` path is tested.
- **A real iPhone** (tested with Playwright's iPhone 15 emulation, not a physical device).

## Decisions from Oliver (2026-10-24)
| Topic | Answer | Applied |
|---|---|---|
| $50 budget | Excludes Claude Code | `docs/budget.md` |
| Model provider | Will create an Anthropic account | Setup guide in README |
| Tools | Google Calendar, Gmail; no notes app or CRM | Phase 4 = Google integrations; Maverick can become the notes/CRM layer |
| Zorza target | NOK, revenue | "About me" defaults; **amount still to confirm** (see open questions) |
| Time zone | Europe/Oslo | Default setting |
| Briefing / quiet hours | 05:30 / 22:00–05:00 | Stored in Settings → Daily rhythm; used from Phase 3 |
| iPhone | Browser app (PWA) is fine for now | No native app yet |
| Autonomy | Maverick should think proactively and suggest actions in life situations | Persona now volunteers labelled suggestions in chat; proactive suggestions outside chat are planned (see next tasks) |

## Open questions
- GitHub repo name (owner/repo) + Claude GitHub App access, so the code can be pushed
- Zorza target: 100,000 NOK/month, or the NOK equivalent of $100,000 (about 1 million NOK)? Current monthly revenue, clients, average deal size
- Mac model: Apple menu → About This Mac
- Which data must stay only on the Mac vs. allowed in encrypted cloud storage
- Voice: pick from samples when voice work starts

## Commands
```bash
pnpm install          # once, and after updating the code
pnpm configure        # once; re-run to add an API key
pnpm build && pnpm start   # run Maverick (http://localhost:3000)
pnpm check            # health check
pnpm test             # unit/integration tests
pnpm test:e2e         # browser tests (after pnpm build)
```

## Monthly cost estimate (model usage, Phase 1)
Light ~$2.50 · typical ~$7.50 · heavy ~$35 (capped at $40 by default). Hosting $0 (runs on the Mac). Details: `docs/budget.md`.

## Next tasks
**Phase 1 follow-ups (small):**
- Verify live Claude calls with Oliver's key; tune routing rules from real use
- Budget periods in Oliver's time zone instead of UTC
- Export all data (JSON) from Settings

**Phase 2: Voice (needs approval + voice choice):**
- Push-to-talk in the browser with a clearly visible microphone state; text fallback always available
- Streaming STT → Claude → streaming TTS, interruptible playback, measured latency
- Vendor shortlist with costs and 3–4 licensed British male voice samples for Oliver to choose from
- Microphone permission enabled only on the conversation page, only after an explicit opt-in
- Later: opt-in local "Hey Maverick" wake word on the Mac only

**Before any public-internet deployment:** passkeys or TOTP second factor (ADR 0004).
