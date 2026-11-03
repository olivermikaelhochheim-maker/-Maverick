# ADR 0012: Cloud deployment on Render, two-step login required

Status: Accepted (2026-11-03). Supersedes the "later" part of ADR 0007.

## Context
Oliver wants one address that works on any device, and briefings that don't depend on a sleeping Mac.

## Options considered (prices from third-party pages, Nov 2026, to verify)
| Host | ~Monthly | Fit |
|---|---|---|
| Render (Starter + 1 GB disk) | ~$7.25 | Deploys from GitHub via a blueprint in the web UI; auto-deploy on push; always on; persistent disk |
| Railway (Hobby) | $5 minimum + usage | Similar UX; usage-billed, so it can creep |
| Fly.io (shared-cpu-1x 512 MB + volume) | ~$4 | Cheapest, but managed from the command line |
| Vercel / serverless | n/a | Unsuitable: no always-on process for the scheduler, no persistent disk for the embedded database |

## Decision
- **Render**, one Docker web service (Starter, Frankfurt) with a 1 GB persistent disk at `/data` holding the embedded PGlite database. Single instance is fine for one user; `DATABASE_URL` remains available for a managed Postgres later.
- `render.yaml` blueprint: generated `MAVERICK_DATA_KEY` (any long secret is accepted and derived to 32 bytes) and `MAVERICK_SETUP_CODE`; `MAVERICK_REQUIRE_2FA=1`, `MAVERICK_TRUST_PROXY=1`, `MAVERICK_COOKIE_SECURE=1`; the Anthropic key is entered in the dashboard.
- **Two-step login (TOTP) is mandatory when internet-facing** (ADR 0004's precondition): 6-digit codes per RFC 6238 with ±1 step drift and replay protection, 10 single-use hashed recovery codes, a password-only session that expires after 10 minutes and can do nothing but submit the code, and the same lockout as passwords. Passkeys may come later.
- Web Push keys are generated on first start and stored encrypted in the database (`app_secrets`), so no manual key step.
- The container starts as root only to fix the disk's ownership, then drops to the unprivileged `node` user (`setpriv`).
- HSTS on every response (browsers ignore it over plain http, so local use is unaffected).
- Behind the proxy, the client IP for lockouts is the **last** `X-Forwarded-For` entry (appended by Render), not the spoofable first one.
- Moving data: Export (decrypted JSON) on the old install → Import on a fresh cloud install, re-encrypted with the new key.

## Verified
The image built and ran locally the way Render runs it (custom PORT, root-owned disk, host-generated key, 2FA required). A scripted first-run went through setup, forced 2FA, QR, recovery codes, chat, auto-generated push keys, HSTS, password-only lockout, and survived a restart with data intact.

## Not verified
Render itself (blueprint field names, `generateValue` format, disk mount ownership). The design tolerates the unknowns: any key format, any disk owner.

## Risks
- Render (as the host) can technically read environment variables, including the data key. Encryption at rest protects disk snapshots and backups, not against the host. Acceptable for this use; revisit before storing financial data.
- One instance, so about a minute of downtime per deploy.
- The image is large (~2.4 GB) because it keeps build tooling; it can be slimmed later.
