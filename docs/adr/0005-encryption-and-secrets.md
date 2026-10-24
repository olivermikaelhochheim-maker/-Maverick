# ADR 0005: Application-level encryption and secret storage

Status: Accepted (2026-10-24)

## Decision
- Conversation titles, message content and the settings document (which holds "About me") are encrypted with AES-256-GCM before they reach the database. GCM authenticates the data, so tampering is detected.
- The key (`MAVERICK_DATA_KEY`, 32 random bytes) comes from an environment variable or, on macOS, the **Keychain** (service `maverick`). `pnpm configure` defaults to the Keychain on a Mac.
- The Anthropic API key is looked up the same way (environment, then Keychain).
- `.env` is created with permissions 600 and is git-ignored.
- Logs are structured JSON with sensitive keys redacted (passwords, tokens, keys, content, email) and API-key patterns scrubbed from free text. Message text never goes to logs.

## Trade-offs
- Losing the data key means losing stored conversations. Setup tells Oliver to back it up in a password manager.
- Usage metadata (token counts, model names, timestamps) is not encrypted, so the budget can be summed in SQL. It contains no content.
- Key rotation isn't built yet (the ciphertext carries a `v1` version prefix so rotation can be added).
- `pnpm configure` passes secrets to the macOS `security` tool as a command-line argument, so they're briefly visible to other processes run by the same user. Acceptable on a single-user Mac; noted in the threat model.
