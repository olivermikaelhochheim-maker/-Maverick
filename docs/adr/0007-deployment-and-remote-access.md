# ADR 0007: Hybrid deployment: Mac first, private network for iPhone, cloud later

Status: Accepted (2026-10-24)

## Decision (Phase 1)
- Maverick runs on Oliver's Mac.
- iPhone at home: same Wi-Fi, `http://<mac-name>.local:3000`.
- iPhone away from home: **Tailscale** (free for personal use), a private encrypted network between Oliver's own devices. The Mac is **never exposed to the public internet** (no port forwarding, no public tunnels).
- Limitation: when the Mac is asleep or off, Maverick is unavailable on the iPhone.

## Later (Phase 4, when integrations and notifications need always-on)
Move the web app and database to the cloud (e.g. a small container host + managed Postgres with `DATABASE_URL`), with HTTPS, passkeys (ADR 0004) and secrets in the host's secret manager. Mac-only capabilities (local files, wake word) then run in a small local companion that connects outbound to the cloud and reports "unavailable" when offline.
