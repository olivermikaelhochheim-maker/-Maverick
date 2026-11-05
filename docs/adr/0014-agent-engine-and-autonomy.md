# ADR 0014: Agent engine: fixed plans, per-step autonomy policy, emergency stop

Status: Accepted (2026-11-05)

## Context
Oliver asked for an autonomous "command system": missions that plan, execute, ask for approval and report, with four autonomy levels and an emergency stop. The safety rules from the original brief still apply: nothing external, financial or irreversible without per-action confirmation; external text can't authorise actions; never claim an action happened without confirmation.

## Decision
- **One engine, named agents.** Command, Operations, Intelligence, Finance, Performance, Communications and System are permission scopes (tool groups) inside one orchestrator, not separate LLM processes. Cheaper, and every action is visible in one log.
- **Fixed plans.** A mission's steps are fixed when it's created, either from a template (deterministic) or by the LLM planner (live model only). The planner can only choose registered tools through a `submit_plan` tool; every input is validated by the tool before anything is stored; an invalid plan falls back to a read-only template plan. Tool outputs (calendar text, web pages, files) are never interpreted as new steps.
- **Policy at execution time.** Each step's decision (`auto`, `approve`, `recommend`, `blocked`) is computed when it is about to run, from the global mode (a mission may be lower, never higher), the tool's risk (read, low, medium, high), per-tool overrides and the daily automatic-action cap. Changing the mode or switching a tool off affects missions already running.

  | Mode | read | low | medium | high |
  |---|---|---|---|---|
  | 1 Advisory | run | recommend | recommend | recommend |
  | 2 Assisted | run | approve | approve | approve |
  | 3 Autonomous | run | auto (cap) | approve | approve |
  | 4 Autopilot | run | auto (cap) | auto if the tool allows (cap) | approve |

  Overrides: `off` blocks; `approve` always asks; `auto` lets a low or medium tool run without asking in modes 2-4. No override loosens a high-risk tool.
- **No dangerous tools exist.** There is no tool that sends messages, moves money, buys, books, posts or deletes. Email is drafted and handed to Oliver's own mail app via `mailto:`. "Low risk" means "changes data inside Maverick only" (tasks, reminders, drafts).
- **Approvals cover one step.** Approving runs that step once; it never raises the mode.
- **Execution.** Steps run one at a time per mission. A step is claimed with an atomic `UPDATE … WHERE status='pending'`, runs with a per-tool timeout, retries up to 3 times on unexpected errors (not on validation errors), and records its output encrypted. A step left `running` for 5+ minutes (crash, restart) is returned to `pending`. The executor loop runs every 3 s in the server process and is also "kicked" right after launches and approvals.
- **Emergency stop** (`settings.agent.halted`): aborts running steps (they return to `pending`), blocks every step and automation, and is on every screen. Releasing it asks for confirmation; engaging it doesn't.
- **Statuses are distinct**: recommended (not executed), awaiting approval, running, done (with the store's confirmation of what changed), failed, skipped. Reports list what was not executed.
- **Cost limits**: the monthly/daily budget caps apply to every model call; additionally a per-mission cap (default $0.50). Web search is counted at its maximum ($0.01 × max searches) as an upper bound.
- **Automations** fire once per local day (3-hour catch-up), launch a normal mission, and are subject to the same policy. They don't fire while halted.

## Consequences
- Oliver sees exactly what will happen before it happens (`preview()` on every step) and every transition is in the Logs.
- The live core state is derived from the engine (`executing`, `alert`, `complete`) plus the browser (`listening`, `thinking`); it never animates work that isn't happening.
- Adding a capability = adding one tool with a risk level; the policy and UI pick it up automatically.
