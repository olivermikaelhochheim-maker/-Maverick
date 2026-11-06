# ADR 0015: Task library, learning from answers, batched notifications, overnight preparation

Status: Accepted (2026-11-06)

## Context
Oliver asked for Maverick to be more lively and independent, and for a researched set of a couple of hundred tasks tied to his goals. Research (Fitz et al. 2019; Horvitz's mixed-initiative work; 2025 product failures) says the risk of a proactive assistant is noise and guilt, not too little initiative.

## Decision
- **Task library** (`packages/core/src/library`): 232 tasks from the research document, each with a machine trigger: one-off, habit, after another task (+ days), date window, relative to an anchor date (next exam, the exam after, pilot school start; editable in the Library screen), yearly/monthly/weekly/quarterly/every N days, or a data condition (3+ subscriptions in bank data, low logged energy for 3 weeks, a task overdue 2+ days, no activity for 2 days after a good run). Some tasks unlock only after others are accepted.
- **Daily run** 30 minutes before the morning briefing (catching up later in the day if missed): score live tasks (priority, deadline closeness, how often Oliver accepts tasks from that area, progression), then propose at most `perDay` (default 3) into the existing suggestion inbox, at most one per area, and no L-effort task on a day with 6+ hours on the calendar. Proposals stay proposals: nothing happens until accepted.
- **Learning from answers:** Accept records the task (one-offs are done; recurring ones return next period). "Not now" rests a task for 14 days. "Never" stops it until restored on the Library screen. Area weights use answered suggestions only, never thumbs-up tuning of tone.
- **Batched notifications:** approvals and automation-mission results go into `notification_queue` and are delivered with the morning briefing, the midday digest (default 15:00, configurable or off) or the evening check-in. Reminders Oliver set himself stay immediate.
- **Overnight preparation:** one hour before the briefing, a read-only mission (`overnight_prep`: today's calendar, free time, due and overdue tasks, money, health, report). The morning briefing opens with a link to it and today's library picks.
- Daily jobs are idempotent per local day (`daily_runs`).

## Consequences
- Suggestions arrive at predictable times and stay few. Editing the research document and re-running `python3 scripts/library/generate.py` (after exporting the tables to `scripts/library/rows.json`) updates the library.
- Next candidates (from the same plan): data watchers, shift-aware planning from the roster, earned autonomy per category, memory callbacks, forgiving scores.
