# Maverick

A private AI chief of staff and strategic advisor for Oliver. It runs on your Mac and you use it from the Mac or your iPhone browser.

**What works today (Phase 0 + 1):** signing in, text conversations with Claude that stream as they're written, conversation history, automatic model choice to keep costs down, a live spending meter with hard limits, an audit log, device management, and settings. Everything sensitive is encrypted on disk.

**What doesn't exist yet:** voice, memory, calendar, email, reminders, briefings, the Zorza dashboard. They're planned, see `PROGRESS.md`. Maverick knows it has none of these and will tell you so.

---

## Install on your Mac (about 15 minutes, once)

You'll type commands into **Terminal** (press ⌘+Space, type "Terminal", press Enter). Paste each command, press Enter, and wait for it to finish before the next.

### 1. Install Node.js (the engine Maverick runs on)

Download the **LTS** installer from <https://nodejs.org> (version 22 or newer) and run it like any Mac app. Then in Terminal:

```bash
sudo corepack enable
```

This turns on **pnpm**, the tool that installs Maverick's parts. `sudo` asks for your Mac login password. Nothing shows as you type it; that's normal.

### 2. Get the code

```bash
cd ~
git clone <REPOSITORY-URL> maverick
cd maverick
```

(If your Mac asks to install "command line developer tools", click Install, wait, then run the `git clone` line again.)

### 3. Install and configure

```bash
pnpm install
pnpm configure
```

`pnpm configure`:
- creates the encryption key that protects your conversations, and offers to keep it in your **Mac Keychain** (say yes),
- asks for your **Anthropic API key**. Press Enter to skip and try Maverick in free mock mode first. To get a key: <https://console.anthropic.com> → API Keys. **Also set a monthly spend limit there.** It's an independent safety net on top of Maverick's own limits.
- prints a **setup code**. You'll need it in step 5.

> ⚠️ Save the encryption key in your password manager when prompted. If it's lost, stored conversations can't be recovered.

Run `pnpm check` any time to get a plain-English health check.

### 4. Start Maverick

```bash
pnpm build
pnpm start
```

Leave this Terminal window open. Maverick runs while it's open. (Stop it with Ctrl+C. Next time you only need `cd ~/maverick` and `pnpm start`. Run `pnpm build` again only after updating the code.)

### 5. Create your account

Open <http://localhost:3000> in Safari or Chrome. Enter the setup code from step 3, your email and a password of at least 12 characters. That's the only account Maverick will ever allow.

---

## Use it on your iPhone

**At home (same Wi-Fi):**
1. On the Mac: System Settings → General → Sharing → note the "Local hostname" (e.g. `Olivers-MacBook-Pro.local`).
2. On the iPhone, in Safari: `http://Olivers-MacBook-Pro.local:3000`
3. Share button → **Add to Home Screen** for an app-like icon.

**Away from home: use Tailscale (free, private, encrypted):**
1. Install Tailscale on the Mac (<https://tailscale.com/download>) and on the iPhone (App Store). Sign in on both with the same account.
2. On the iPhone, open `http://<mac-name>:3000`, using the Mac's name as shown in the Tailscale app.

This keeps Maverick off the public internet. Only your own devices can reach it. **Don't** set up port forwarding on your router.

Limitation: if the Mac is asleep or off, Maverick isn't reachable from the iPhone. (Cloud hosting comes in a later phase.)

---

## Where things are

| Screen | What it does |
|---|---|
| Command Center | Greeting, quick ask, spend meter, recent conversations, system status |
| Conversation | Chat. Each reply shows which model answered, why, and what it cost. "Think deeper" uses the strongest model for one message. Esc or the ■ button stops a reply. |
| Usage & Budget | Spend by day and by model |
| Security | Signed-in devices (sign them out remotely) and the audit log |
| Settings | Time zone, personality (wit, directness), "About me" notes, budget limits, model routing, password |

**Budget defaults:** warn and switch to the cheapest model at $30/month, stop at $40/month or $5/day. Change them in Settings.

---

## Backups

Your data is in `~/maverick/data/` plus the encryption key (Keychain or `.env`). Back up both. One without the other is useless, which is the point.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "MAVERICK_DATA_KEY is missing" | Run `pnpm configure` |
| Yellow "Mock mode" banner | No API key found. Run `pnpm configure`, add the key, restart with `pnpm start` |
| "The Anthropic API key was rejected" | The key is wrong or revoked. Create a new one and run `pnpm configure` |
| "port 3000 already in use" | Maverick is already running in another Terminal window |
| Spending cap message | Raise the limit in Settings, or wait for the next day/month (UTC) |
| Anything else | `pnpm check`, and read the last lines in the Terminal window |

Never run two copies of Maverick at the same time: the embedded database allows one at a time.

---

## For developers

```bash
pnpm dev          # dev server with hot reload on :3000
pnpm test         # core unit + integration tests (Vitest)
pnpm test:e2e     # browser tests (Playwright; needs `pnpm build` first)
pnpm typecheck
```

Docs: `docs/architecture.md`, `docs/threat-model.md`, `docs/budget.md`, `docs/adr/`. Progress and next steps: `PROGRESS.md`.
