# ADR 0009: Maverick's tools can only propose; Oliver decides

Status: Accepted (2026-10-24)

## Context
Oliver wants Maverick to "think for himself and suggest actions in life situations". The brief forbids unapproved actions. Model tool use is the natural mechanism, and also the natural attack surface (prompt injection via calendar text or pasted email).

## Decision
- Maverick has four tools: `propose_memory`, `propose_task`, `propose_goal`, `suggest_action`. Each **only** writes a pending row to the suggestion inbox inside Maverick. No tool touches anything external or takes effect on its own.
- Accepting is an explicit click (in the chat chip, the inbox, or the Command Center). Oliver can edit the text first. Dismissing leaves no trace except the audit log.
- Guardrails: strict JSON schemas (`strict: true`) and server-side validation of every input; at most 5 proposals per reply; duplicates of pending items are ignored; at most 30 pending (oldest expire); pending items expire after 14 days; at most 2 tool round trips per reply, budgeted in advance.
- The persona says a proposal is "a suggestion, not done", and the tool result repeats that, so the model doesn't claim to have saved things.
- Proactivity can be switched off in Settings.

## Why this is safe against injection
The worst a malicious calendar invite or pasted email can do is make Maverick *suggest* something, which Oliver sees and can dismiss. External write actions (Phase 4+) will need a separate, per-action confirmation flow; they won't be added to this tool set.
