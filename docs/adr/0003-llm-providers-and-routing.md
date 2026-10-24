# ADR 0003: Provider abstraction and cost-aware model routing

Status: Accepted (2026-10-24)

## Decision
- All models sit behind `LLMProvider.stream(request)`. Implemented: `AnthropicProvider` (official `@anthropic-ai/sdk`, streaming) and `MockProvider` (offline, free, deterministic; used for the demo and tests). Adding OpenAI, Gemini or a local model means one new class.
- Three tiers, configurable in Settings:
  - fast: `claude-haiku-5-5` ($0.10 / $0.50 per million input/output tokens), effort `low`
  - standard: `claude-sonnet-5-5` ($2 / $10), effort `medium`
  - deep: `claude-opus-5-5` ($4 / $20), effort `high`
- Auto routing uses transparent rules, not a classifier: long or analytical messages go to standard, quick exchanges to fast, the "Think deeper" toggle to deep. Past the soft budget limit, everything goes to fast. Each reply shows which model answered and why.
- The time of day goes in as a mid-conversation system message, not in the system prompt, so prompt caching survives across turns. Top-level automatic prompt caching is on.
- Sonnet and Opus requests opt into Anthropic's server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`): if a safety classifier wrongly declines a benign request, the API retries on a recommended fallback model. Haiku 5.5 has no server-side fallback; its refusals are shown as an error.

## Why not always use the strongest model
At about 900 messages a month, Opus-only would cost roughly $40–60 on its own, which breaks the $50 target. The routed mix comes to an estimated $5–10 (see `docs/budget.md`).

## Revisit when
Real usage data exists (Usage page). Tune routing rules from what Oliver actually asks.
