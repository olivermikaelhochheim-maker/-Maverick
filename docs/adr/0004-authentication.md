# ADR 0004: Single-user password auth with server-side sessions

Status: Accepted for local/LAN/Tailscale use. **Must be strengthened before any public-internet deployment.**

## Decision
- Exactly one account. First-run setup requires a one-time setup code (from `.env`) so nobody else on the network can claim it first.
- Passwords: scrypt (N=2^15, r=8, p=1), minimum 12 characters.
- Sessions: 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS). Only a SHA-256 hash is stored. 30-day expiry. Each device's session is listed and can be revoked; a password change signs out all other devices.
- Brute-force protection: 5 failures per email+IP in 15 minutes, and 20 per email from any IP.
- CSRF: every state-changing API call must carry an `Origin` header that matches the host.

## Before public cloud exposure (Phase 4 at the latest)
Add passkeys (WebAuthn) or TOTP as a second factor. OAuth with PKCE (from the brief) applies to *connecting* Google/Microsoft accounts in Phase 4, not to signing in to Maverick.
