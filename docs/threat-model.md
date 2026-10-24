# Threat model (Phase 1)

Assets: Oliver's conversations, personal notes, the Anthropic API key (money), the data encryption key, and later account tokens and financial data.

| Threat | Mitigation now | Gap / later |
|---|---|---|
| Someone on the same Wi-Fi opens Maverick | Login required; one account only; setup code needed to create it; lockout after failed logins | LAN traffic is plain HTTP. Use Tailscale (encrypted) away from home and on untrusted networks |
| Password guessing | scrypt hashes; 5 failures/15 min per email+IP, 20 per email overall | Passkeys/TOTP before any public deployment (ADR 0004) |
| Stolen session cookie | HttpOnly, SameSite=Lax, Secure on HTTPS, hashed at rest, 30-day expiry, per-device revoke, revoke-all on password change | No IP/device binding |
| Cross-site request forgery | Origin check on every write + SameSite cookies | – |
| Clickjacking / XSS | CSP, `frame-ancestors 'none'`, X-Frame-Options DENY; model output rendered via a React Markdown renderer (no raw HTML) | CSP still allows inline scripts (Next.js requirement); nonce-based CSP later |
| Database file copied (stolen laptop, backup leak) | Message content, titles and settings encrypted with AES-256-GCM; key in Keychain | Metadata (timestamps, token counts) readable; enable FileVault on the Mac |
| API key leak | Keychain or 600-permission `.env`; never logged; scrubbed from error text | Set a spend limit in the Anthropic console as a backstop |
| Runaway cost (bug, loop, abuse) | Hard monthly + daily caps enforced before every call; max_tokens clamped to the remaining budget; interrupted calls charged at an estimate | Prices hard-coded, so update `catalog.ts` when pricing changes |
| Prompt injection (pasted emails or web text telling Maverick to act) | Maverick has **no tools**, so injected instructions can't do anything; system prompt marks pasted content as data; user text never enters the system prompt (tested) | Phase 4+: tool calls gated by per-action approval, external content tagged as untrusted, action ledger |
| Model claims it did something it can't | System prompt states it has no tools/accounts and must never claim actions (tested) | Model compliance isn't guaranteed; UI shows no "action taken" states in Phase 1 |
| Data sent to a third party | Only Anthropic receives conversation text, only when a key is configured; "About me" disclosure in Settings | Anthropic's data-retention terms apply; review before sharing sensitive financial data |
| Local process snooping | Single-user Mac assumption | `pnpm configure` briefly passes secrets as a command-line argument to `security` |
| Microphone/camera misuse | `Permissions-Policy` disables microphone and camera entirely | Phase 2 enables the microphone only with a visible, opt-in push-to-talk |
