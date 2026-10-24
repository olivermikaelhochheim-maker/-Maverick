# Monthly cost model

Target: **$50/month** (a target, not a promise). Prices are list prices checked 2026-10-24 for Anthropic. Other vendors are marked *unverified* and get confirmed before the phase that uses them.

## Phase 1 (what exists now)

Assumptions per message: ~5,000 input tokens (system prompt + notes + recent history), ~800 output tokens including the model's internal thinking. Auto routing: 60% Haiku 5.5 · 35% Sonnet 5.5 · 5% Opus 5.5.

| | Light | Typical | Heavy |
|---|---|---|---|
| Messages / month | 300 (10/day) | 900 (30/day) | 2,400 (80/day, longer context) |
| Claude API | ~$2.50 | ~$7.50 | ~$35 |
| Hosting (Mac) | $0 | $0 | $0 |
| Tailscale (personal) | $0 | $0 | $0 |
| **Total** | **~$2.50** | **~$7.50** | **~$35** |

Per-message estimates: Haiku ≈ $0.001, Sonnet ≈ $0.015 (with prompt caching), Opus ≈ $0.05.
The default hard cap ($40) stops the heavy case from passing $40 in model costs.

## Later phases (planning ranges, *unverified*)

| Item | Phase | Rough monthly |
|---|---|---|
| Speech-to-text (cloud, ~0.5–1¢/min) | 2 | $1–5 for 200–500 min |
| Licensed British TTS voice | 2 | $5–22 subscription tiers, or pay-per-character |
| Cloud hosting + managed Postgres | 4 | $0–25 (free tiers exist; always-on small instance ~$5–20) |
| Web search API for research digests | 4–5 | $0–10 |
| Push notifications (Web Push) | 4 | $0 |

**Tension to flag early:** real-time voice with a premium British voice plus always-on cloud hosting could take the total to roughly $40–70 at heavy use. If that happens, the plan is text-first with push-to-talk, plus a cheaper TTS tier, rather than cutting model quality.

**Confirmed by Oliver (2026-10-24):** the $50 covers Maverick's running costs only; the Claude Code subscription is separate.
