# ADR 0006: Hard budget enforcement in code, not just alerts

Status: Accepted (2026-10-24)

## Decision
- Every model call writes a row to `usage_events` (the ledger) with tokens and computed cost from `catalog.ts` prices.
- Before a call: if month-to-date ≥ hard limit, or today ≥ daily limit, the call is refused **before anything is sent**.
- Otherwise `max_tokens` is reduced so the worst case (estimated input + max output) fits inside what's left. A call can't overshoot the cap by more than the input-estimate error.
- Past the soft limit: a warning, and routing drops to the fast model.
- If a stream is interrupted before the provider reports usage (Stop, network loss), the call is charged at an **estimate** and flagged `estimated`, so the ledger errs on the safe side.
- The HTTP layer drains the chat pipeline even after the client disconnects. Otherwise interrupted calls would go unrecorded (this bug was found and fixed by an end-to-end test).

## Defaults
Soft $30, hard $40, daily $5, all for model usage. That leaves about $10 of the $50 target for hosting and voice later. Adjustable in Settings.

## Not covered
- Periods are UTC months/days in Phase 1, not Oliver's local time zone.
- Maverick's figures are estimates from list prices. The Anthropic console is the real bill. **Set a spend limit in the Anthropic console too** as an independent backstop.
