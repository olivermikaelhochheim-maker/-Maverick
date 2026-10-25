# Maverick: progress log

## Status: Milestone 3a (voice, built-in engines) built and tested with simulated speech. Next: Oliver tries it on Mac/iPhone, then picks a premium voice.

Last updated: 2026-10-24 · Code: https://github.com/olivermikaelhochheim-maker/-Maverick

Milestone order (agreed with Oliver 2026-10-24): **Chief of Staff core** (old Phase 3 + read-only Google Calendar from Phase 4) came before voice, because Oliver's priorities are proactive thinking, suggestions and accountability.

---

## Completed

### Milestone 0: Discovery & scaffolding
Monorepo, `pnpm configure` / `pnpm check`, docs, ADRs, free mock mode.

### Milestone 1: Conversational MVP
Single-user auth, streaming chat, model routing (Haiku/Sonnet/Opus 5.5), hard budget limits, encryption at rest, audit log, responsive dark UI, PWA.

### Milestone 2: Chief of Staff core
- **Memory Vault**: categories, provenance (who/where/when), confidence, per-memory retention and expiry, pin, edit, delete, search, export. Each reply records which memories it used and why ("Context used").
- **Goals & tasks**: horizons and measurable metrics; tasks with priority, due date, reminder time and linked goal; ranked by urgency.
- **Suggestion inbox**: Maverick proposes memories, tasks, goals and life/work actions through four proposal-only tools. Nothing takes effect until Oliver accepts (optionally after editing). Chips in chat, inbox on Command Center and Goals & Tasks.
- **Proactive persona**: Maverick volunteers labelled suggestions in conversation; Oliver decides.
- **Briefings**: morning (05:30), evening check-in (21:00), weekly review (Sun 18:00), in Oslo time. Written by Sonnet 5.5, or a free template from real data when no model is available or the budget is at the soft limit. "Brief me now" on demand.
- **Scheduler**: in-process, once a minute, idempotent, catches up after the Mac sleeps.
- **Notifications**: Web Push to iPhone/Mac with explicit consent, per-device opt-in, quiet hours 22:00–05:00 (reminders held until they end), daily cap, test button.
- **Google Calendar (read-only)**: OAuth with PKCE, read-only scope verified, tokens encrypted, automatic refresh, "needs reconnecting" state, disconnect revokes at Google. Agenda on the Command Center and in briefings and chat context. Demo calendar for testing.
- **Data export**: everything, decrypted, as JSON.
- **Paste many at once** (Memory Vault): one memory per line, bullets/numbering/code fences stripped, duplicates skipped, all-or-nothing, up to 100 lines.
- Oliver's answers applied: Oslo time zone, NOK revenue goal, Google tools, he/him, daily rhythm.

### Milestone 3a: Voice (built-in, free)
- Push-to-talk mic in Conversation, with a visible red "Listening…" bar, Cancel/Esc, and auto-send when you stop talking (optional)
- Replies read aloud sentence by sentence as they stream, in a British male voice (Apple Daniel/Arthur, Chrome UK Male); Markdown, links and emoji removed before speaking
- Barge-in: tapping the mic, sending or Stop silences Maverick immediately
- Spoken-style replies (short, no lists) when you talk instead of type
- Latency shown per spoken reply ("spoke after 1.8s")
- Settings → Voice on this device: voice picker with preview, speed, pitch, when to speak, language (EN/NO/PL/DE), privacy notes, how to install Enhanced voices
- ADR 0011; microphone allowed for Maverick's own pages only

## Test results (2026-10-24, Linux cloud container)
| Suite | Result |
|---|---|
| TypeScript typecheck (core + web) | ✅ pass |
| Core unit + integration (Vitest, real embedded Postgres) | ✅ 105 / 105 |
| Browser end-to-end (Playwright, production build; iPhone 15 + desktop) | ✅ 37 passed, 1 skipped by design |

New coverage: Oslo DST time maths and quiet hours across midnight; memory provenance, expiry, selection reasons and token cap; task ranking and reminders; accept/edit/dismiss semantics; proposal tool validation and limits; strict-schema compatibility; chat context (memories, goals, tasks, calendar) and tool events; Google token refresh, unselected calendars, declined events, revoked tokens, missing-scope refusal; push consent, quiet hours, daily cap, dead subscriptions, endpoint allowlist; briefing template vs. model, budget fallback, once-per-day scheduling, catch-up, opt-out; export.

Bugs found by tests and fixed this milestone: suggestion chips vanished on reload; Settings scrolled sideways on iPhone; notification log and cap check used different clocks; memory-match reasons showed word stems instead of words.

## ⚠️ Not yet verified (needs Oliver's Mac and accounts)
- **Live Claude calls**, including the tool round trip (no API key in the build environment). First test: ask Maverick to remember something and to plan your day; check that a chip appears and replies stream.
- **Google sign-in against real Google** (the flow is tested against a simulated Google).
- **Real push delivery to an iPhone** (tested with a simulated push service).
- **`tailscale serve`**: whether it passes the original host header through. `MAVERICK_ALLOWED_ORIGINS` covers the case where it doesn't.
- macOS Keychain storage; a physical iPhone.
- **Voice on real devices** (tested with simulated microphone and speakers): iOS Safari speech recognition reliability, and which Enhanced/Premium British voices each device offers.

## Open questions for Oliver
1. ~~Zorza target~~ Answered: 100,000 NOK/month of self-created income by end of 2027; Zorza is still an idea. Pilot training (integrated) to finish ~Oct 2029.
2. Mac model and macOS version (Apple menu → About This Mac).
3. Which personal or financial data must stay only on the Mac vs. allowed in encrypted cloud storage (matters for the cloud move).

## Commands
```bash
pnpm install               # after updating the code
pnpm configure             # add/change API key, Google credentials
pnpm build && caffeinate -is pnpm start    # run Maverick, keep the Mac awake on power
pnpm check                 # health check
pnpm test                  # unit/integration tests
pnpm test:e2e              # browser tests (after pnpm build)
```

## Monthly cost estimate
Typical ~$10 (chat ~$8 + briefings ~$1.20 + extra context ~$0.60); light ~$3; heavy capped at $40. Hosting $0 (Mac), Google API $0, push $0. Details: `docs/budget.md`.

## Next milestones (proposed)
**3b. Premium voice:** a natural neural British voice through one vendor (Azure / OpenAI / ElevenLabs; ~$4–12/month typical), chosen after Oliver hears samples. Then an opt-in local "Hey Maverick" wake word on the Mac.

**4. Gmail + calendar writes (with confirmation):** read and summarise email, draft replies; every send or calendar change waits in an approval queue. Plus a cloud move (always-on briefings without the Mac) and passkeys before any public exposure.

**5. Zorza CEO Advisor:** KPI definitions, client pipeline (Maverick as the light CRM Oliver doesn't have yet), revenue decomposition from real NOK baselines, weekly CEO review.

Small follow-ups: shift-aware briefing time (an hour before the first calendar event); yearly repeating reminders (birthdays); learning from feedback (👍/👎 + "Teach Maverick"); budget periods in Oslo time; snooze for reminders.
