# MAVERICK v2: audit, architecture and roadmap

Written 2026-11-05 before the "AI operations system" redesign.

## 1. Audit of what exists

| Area | State | Verdict |
|---|---|---|
| Stack | pnpm monorepo: `packages/core` (TypeScript logic, ~6k lines) + `apps/web` (Next.js 16 App Router, ~6k lines). PGlite (embedded Postgres) or Postgres via `DATABASE_URL`. Docker + Render blueprint. | **Keep.** Sound, tested, deployable. |
| Auth & security | Single user, scrypt, hashed sessions, TOTP 2FA (required in cloud), CSRF origin checks, CSP/HSTS, AES-256-GCM field encryption, audit log, lockouts. | **Keep.** Strong base for autonomy. |
| AI | Anthropic provider (streaming, tool loop, caching, refusal fallback), mock provider, cost routing Haiku/Sonnet/Opus, hard budget enforcement. | **Keep**; extend with web search for research. |
| "Agent" features | Proposal-only tools (inbox), briefings, rule-based insights. **No planner, no multi-step execution, no workflow state, no approvals for actions, no autonomy levels, no emergency stop.** | **Main gap.** Build the agent engine. |
| Scheduler | In-process, minute tick, idempotent briefings and reminders. | **Keep**; add an agent executor loop and user automations. |
| Data domains | Memory, goals, tasks, files, calendar (read-only Google), focus, usage. **No finance, health or communications data.** | Add **user-provided** finance (manual and bank CSV import) and health logs; email **drafts** (sending needs a Gmail integration, not built). |
| Voice | Browser push-to-talk and speech, spoken style. | **Keep**; route voice commands to missions, not only chat. |
| UI | Dark navy dashboard, rounded cards, good data views. Feels like a polished SaaS dashboard, not an operations system. AI orb is decorative except during chat. | **Redesign.** New visual system, shell, command bar, intelligence panel, live core bound to real states. |
| Tests | 138 core + 46 browser tests, Docker smoke test. | Keep; extend for every new capability. |

## 2. Architecture

```
           ┌───────────── Command bar: mode · health · clock · integrations · voice · E-STOP ─────────────┐
 Nav ──►   Screens (Next.js)          Live state: /api/agent/status (polled every 3s) → Core state machine
           │                                                                                            │
           ▼                                                                                            ▼
     API routes ──► packages/core
                     ├─ agent/   Orchestrator (Command agent)
                     │    ├─ planner    templates (deterministic) · LLM planner (submit_plan tool, live only)
                     │    ├─ tools      registry: agent · risk · external? · available() · preview() · run()
                     │    ├─ policy     autonomy mode × tool risk × per-tool override × limits → auto | approve | recommend | blocked
                     │    ├─ executor   claims steps atomically, runs with timeout and retries, records outputs
                     │    ├─ approvals  human checkpoints with previews; approve / reject
                     │    ├─ events     execution log (encrypted messages)
                     │    └─ automations recurring missions (daily / weekdays / weekly)
                     ├─ finance/  transactions (encrypted), CSV import (Norwegian bank formats), categories, budgets, intelligence
                     ├─ health/   workouts, sleep, weight, energy logs and trends
                     ├─ comms/    email drafts (human sends via mail app until Gmail is integrated)
                     └─ existing: memory · planning · suggestions · files · calendar · focus · briefing · budget · auth
```

### Hierarchy
**Objective** (goal) → **Mission** (has objective, priority, deadline, completion criteria, mode, status) → **Operations** (mission steps, each owned by an agent and using one tool) → **Tasks** (tasks created by or linked to the mission) → **Execution** (step runs, logged) → **Review** (mission report and statistics).

### Agents (roles, not separate processes)
Agents are named tool groups with their own permission scope, coordinated by one orchestrator. Spawning separate LLM processes would add cost and failure modes without improving a single-user system.
- **Command**: plans missions, composes reports.
- **Operations**: calendar reads, task changes, reminders, schedule analysis.
- **Intelligence**: memory recall, web research (live model).
- **Finance**: spending summaries from imported data.
- **Performance**: health and focus summaries.
- **Communications**: email drafts.
- **System**: integration and engine health.

### Autonomy modes (global; a mission can be lower, never higher)
| Mode | Read steps | Low-risk internal changes (tasks, reminders, reports) | Medium (bulk changes, paid research) | High / external (send, spend, delete) |
|---|---|---|---|---|
| 1 Advisory | run | **recommended only** | recommended only | recommended only |
| 2 Assisted | run | approval | approval | approval |
| 3 Autonomous | run | **auto** (within daily limit) | approval | approval |
| 4 Autopilot | run | auto | auto if the tool's policy allows | approval, always |

Per-tool overrides (`auto` / `approve` / `off`) can only *tighten* external and high-risk tools. **Emergency stop** halts every mission and automation instantly until resumed.

### Safety properties
- Plans are fixed when a mission is created and shown to Oliver. Tool outputs (calendar text, files, web pages) can't add steps; replanning creates a new plan.
- The planner can only choose registered tools, and every tool validates its input.
- Statuses are distinct: **recommended** (not executed) · **awaiting approval** · **running** · **done** (with the tool's confirmation) · **failed** · **skipped**.
- Nothing external is executed: there is no tool that sends email, moves money or buys anything. Drafts are handed to Oliver's own mail app.
- Interrupted steps (server restart) are recovered as pending, with attempts counted.

### Live core states (bound to real events)
`idle` · `listening` (mic open) · `thinking` (chat waiting, or planning) · `executing` (any step running) · `alert` (pending approval, critical insight, or E-STOP) · `complete` (a mission finished within the last 8 s).

## 3. Roadmap and acceptance criteria
1. **Agent engine:** templates and LLM planner, policy, executor, approvals, events, recovery, automations, E-STOP. *Accept:* "Prepare me for tomorrow" plans, executes permitted steps per mode, requests approval for the rest, produces a readiness report, survives restart; tests per mode.
2. **Domains:** finance (CSV import, categories, budgets, recurring and anomaly detection), health logs and trends, communications drafts. *Accept:* parser handles Norwegian bank CSVs; intelligence only from real rows.
3. **Design system v2 and shell:** tokens, HUD panels, command bar, nav, intelligence panel, live core. *Accept:* every screen uses it; reduced motion respected; chart colours validated.
4. **Screens:** Command Center, Intelligence (chat), Mission Control, Agent Ops, Daily Ops, Projects & Goals, Finance, Health, Communications, Research, Automations, Logs, Permissions & Settings. *Accept:* no placeholder screen; every control does something real.
5. **Voice commands:** intent routing to missions or chat from the core. *Accept:* "prepare tomorrow's briefing" launches the mission.
6. **Hardening:** unit, browser and Docker tests; screenshots on desktop and iPhone.

Not in this build (needs credentials or integrations): sending email (Gmail), live bank feeds, wearables, wake word.
