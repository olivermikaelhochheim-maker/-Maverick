# Threat model (updated for the chief-of-staff milestone)

Assets: Oliver's conversations, memories, goals and tasks, personal notes, Google Calendar tokens, the Anthropic API key (money), the data encryption key, and later account tokens and financial data.

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
| Prompt injection (calendar invites, pasted emails telling Maverick to act) | Tools can only **propose** to Maverick's own inbox (ADR 0009); calendar text is fenced as `<calendar_data>` and labelled untrusted; pasted content is data per the system prompt | A convincing injected suggestion could still appear in the inbox; Oliver reviews each one. External write tools will need per-action confirmation |
| Model claims it did something it can't | Persona and tool results say proposals aren't done until accepted; persona lists what Maverick cannot do (tested) | Model compliance isn't guaranteed; the UI only shows "saved" after Oliver accepts |
| Model guesses stored as facts | Inferred memories need approval, carry confidence and source, and are labelled "inferred" when sent to the model | – |
| Google token theft | Tokens encrypted at rest; read-only scope verified at connect time; PKCE + state cookie on the OAuth flow; disconnect revokes at Google | Access token usable for ≤1h if the server memory is compromised |
| Push abuse (SSRF via crafted subscription) | Endpoints restricted to Apple/Google/Mozilla/Microsoft push hosts over https | – |
| Notification spam or night-time pings | Consent toggle, per-device opt-in, quiet hours enforced server-side, daily cap | – |
| Data sent to a third party | Only Anthropic receives conversation text, only when a key is configured; "About me" disclosure in Settings | Anthropic's data-retention terms apply; review before sharing sensitive financial data |
| Local process snooping | Single-user Mac assumption | `pnpm configure` briefly passes secrets as a command-line argument to `security` |
| Microphone misuse / covert listening | Voice is off until enabled per device; push-to-talk only (no wake word, no background listening); a red "Listening…" bar is visible whenever the mic is on; Cancel/Esc stops it; `Permissions-Policy: microphone=(self)` blocks any embedded third party; camera disabled | Speech-to-text runs at Apple (Safari) or Google (Chrome): their privacy terms apply to what you say |
