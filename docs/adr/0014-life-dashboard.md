# ADR 0014: Life dashboard (habits and journal) inside Maverick

Status: Accepted (2026-11-04)

## Context
Oliver built "Daybook", a separate habit tracker and journal running as a claude.ai artifact. Its data lived in claude.ai storage that Maverick's server can't read, so Maverick couldn't use habits or mood in briefings, and Daybook had no reminders. We moved the life dashboard into Maverick as a native module.

## Decision
- **Data model** (migration `0005_life_dashboard`): `habits`, `habit_versions`, `habit_logs`, `day_flags`, `journal_entries`. Titles, notes and all journal content (including mood/energy ratings) are encrypted with the data key. Area, dates and log statuses stay queryable.
- **Schedule history**: a schedule or status change adds a version from a chosen date, so past weeks keep their old schedule and score.
- **Scoring** lives in `packages/core/src/life/score.ts` as pure functions, shared by the server and the browser (`@maverick/core/life/score`). Rules: daily = done ÷ scheduled; weekly targets count up to the target; rest/illness leave the denominator; "not logged" is kept apart from "missed"; nothing scheduled shows "No habits scheduled", never 0%.
- **What Maverick sees**: chat context gets today's habits, the week so far and recent ratings from entries Oliver allowed. Evening check-ins also read today's allowed entry; weekly reviews read the last 7 days of allowed entries. Entries with "Maverick may read this entry" off are never sent.
- **Reminders**: optional per-habit time; pushed once per local day only while the habit is due and not logged; held in quiet hours, dropped if quiet hours last past the day.
- **Journal feedback** goes through the normal chat (`/chat?q=…`), so it uses the same model routing, budget limits and proposal tools as everything else.
- **Import**: Daybook's JSON export (habits with history, logs, rest days, journal, and profile lines Oliver stated or confirmed → memories with `source: import`). Maverick's own export/import includes Life.

## Not included
Daybook's 120-question onboarding interview was not ported. Its reviewed profile arrives through the import as memories; the Memory Vault is Maverick's profile. A `propose_habit` tool (Maverick suggesting habit changes through the inbox) is a follow-up; for now reviews use `suggest_action`.
