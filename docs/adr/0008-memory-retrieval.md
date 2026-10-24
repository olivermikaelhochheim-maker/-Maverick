# ADR 0008: Memory without vector search (for now)

Status: Accepted (2026-10-24)

## Context
The brief suggests pgvector for semantic memory. Anthropic has no embeddings API, so vectors mean another vendor (e.g. Voyage, OpenAI) or a heavy local model. Memory content is also encrypted at rest, so the database can't search it anyway.

## Decision
- Memories are categorised (profile, preference, goal, project, decision, past event, short-term) with provenance (who/what created it, source conversation), confidence, retention and expiry.
- For each message, Maverick sends: all **pinned** memories, all **profile/preference/goal** memories, and other memories that share meaningful words with the message. Each carries a recorded **reason** ("Always included: goals", "Matches: billing, retainer"), capped at ~1,500 tokens.
- Which memories went into each reply is stored (`message_context`) and shown under the reply as **Context used**.
- The model's own inferences become memories only through the suggestion inbox (ADR 0009). An approved inference keeps its confidence; Oliver editing the text makes it his own statement (confidence 1.0).

## Revisit when
There are more than ~300 memories, or keyword matching misses things in practice. Then add embeddings of approved memories only (decrypted in memory, vectors stored unencrypted: a documented trade-off) with pgvector, keeping the same reason/provenance contract.
