# Maverick

A private AI chief of staff and strategic advisor for Oliver. It runs on your Mac; you use it from the Mac or your iPhone.

**What works today**
- **Conversation** with Claude, streamed live, with cost-aware model choice and hard spending limits.
- **Memory Vault**: what Maverick knows about you, where each memory came from, how long it's kept. Edit, delete or export anything.
- **Goals & tasks** with priorities, due dates and reminders.
- **Suggestion inbox**: Maverick thinks ahead and proposes memories, tasks, goals and actions. Nothing takes effect until you accept it.
- **Briefings**: morning briefing (05:30), evening check-in (21:00) and weekly review (Sunday 18:00), built from your calendar, tasks and goals.
- **Google Calendar**, read-only.
- **Push notifications** on iPhone and Mac, never during quiet hours (22:00–05:00).
- Encryption at rest, an audit log of every action, device management.

- **Voice**: tap the mic and talk; Maverick answers out loud in a British voice (built into your Mac/iPhone, free).

**What it can't do (yet):** a premium voice, a "Hey Maverick" wake word, sending email or messages, changing your calendar, buying, booking, posting, moving money. Maverick knows this and won't claim otherwise. The plan is in `PROGRESS.md`.

---

## Install on your Mac (about 15 minutes, once)

You'll type commands into **Terminal** (⌘+Space, type "Terminal", Enter). Paste each command, press Enter, and wait for it to finish before the next.

### 1. Install Node.js

Download the **LTS** installer from <https://nodejs.org> (version 22 or newer) and run it. Then in Terminal:

```bash
sudo corepack enable
```

`sudo` asks for your Mac login password. Nothing shows as you type; that's normal.

### 2. Get the code

```bash
cd ~
git clone https://github.com/olivermikaelhochheim-maker/-Maverick.git maverick
cd maverick
```

If your Mac asks to install "command line developer tools", click Install, wait, then run the `git clone` line again. GitHub may ask you to sign in because the repository is private.

### 3. Install and configure

```bash
pnpm install
pnpm configure
```

`pnpm configure`:
- creates the key that encrypts your data and offers to keep it in your **Mac Keychain** (say yes);
- asks for your **Anthropic API key**. Press Enter to skip and try Maverick in free mock mode first;
- creates the keys for phone notifications;
- optionally takes your Google Calendar credentials (see "Connect Google Calendar" below; you can do it later);
- prints a **setup code** for step 5.

**Getting an Anthropic API key:** go to <https://console.anthropic.com>, sign up, add a card under **Billing**, set a **monthly spend limit** (about $40) under Limits, then **API Keys → Create key**. Paste the key into `pnpm configure`. The console limit is a safety net on top of Maverick's own limits.

> ⚠️ Save the encryption key in your password manager when prompted. If it's lost, stored data can't be recovered.

Run `pnpm check` any time for a plain-English health check.

### 4. Start Maverick

```bash
pnpm build
caffeinate -is pnpm start
```

`caffeinate -is` keeps the Mac awake while Maverick runs **and the charger is connected**, so the 05:30 briefing and reminders arrive on time. Leave this Terminal window open; stop with Ctrl+C. Next time: `cd ~/maverick` then `caffeinate -is pnpm start`. Run `pnpm build` again only after updating the code.

If the Mac does sleep (on battery, or with the lid closed), Maverick catches up when it wakes: a missed morning briefing is still produced until about 11:30. For a guaranteed wake-up you can also schedule one (runs once, survives restarts):

```bash
sudo pmset repeat wakeorpoweron MTWRFSU 05:20:00
```

### 5. Create your account

Open <http://localhost:3000>, enter the setup code from step 3, your email, and a password of at least 12 characters. That's the only account Maverick will ever allow.

---

## Use it on your iPhone

**Quick look, at home on the same Wi-Fi:** in Safari, open `http://<your-mac-name>.local:3000`. The Mac's name is under System Settings → General → Sharing → Local hostname. This works for chatting, but **notifications need the secure setup below**.

**Recommended: Tailscale (free, private, encrypted, works anywhere):**
1. Install Tailscale on the Mac (<https://tailscale.com/download>) and the iPhone (App Store). Sign in on both with the same account.
2. In the Tailscale admin page (<https://login.tailscale.com/admin/dns>), turn on **MagicDNS** and **HTTPS Certificates**.
3. On the Mac, in a new Terminal window:
   ```bash
   tailscale serve --bg 3000
   ```
   It prints an address like `https://olivers-macbook.tail1234.ts.net`. Only your own Tailscale devices can open it.
4. Add that address to `.env` in the maverick folder: `MAVERICK_ALLOWED_ORIGINS=https://olivers-macbook.tail1234.ts.net`. Then restart Maverick.
5. On the iPhone, open that address in Safari → Share → **Add to Home Screen**.

**Turn on notifications (iPhone):** open Maverick **from the home-screen icon** (iOS only allows notifications for home-screen apps). Then go to More → Settings, tap **Enable on this device**, and allow. In "Daily rhythm & proactivity", tick **Allow push notifications** and save. Tap **Send a test** to check.

Don't set up port forwarding on your router. Maverick should never be reachable from the public internet.

---

## Talk to Maverick (voice)

1. **Settings → Voice on this device → tick "Use voice on this device".** Do this on each device you want to talk on; voice settings are per device.
2. Pick **Maverick's voice**. A British male voice is preselected. Tap **▶ Preview voice**.
3. **For a much better voice (free, 2 minutes):**
   - **Mac:** System Settings → Accessibility → Spoken Content → System voice → **Manage Voices…** → English (United Kingdom) → download **Daniel (Enhanced)** or **Arthur (Premium)** if listed.
   - **iPhone:** Settings → Accessibility → Spoken Content → Voices → English → English (UK) → download **Daniel (Enhanced)** or **Arthur (Enhanced)**.

   Then reload Maverick and pick that voice.
4. In **Conversation**, tap the **🎙 mic** and talk. A red **Listening…** bar shows while the microphone is on. Tap the mic again (or just pause) and your message sends; Maverick answers out loud.
5. Tap the mic or **Stop speaking** to interrupt him; **Esc** cancels.

The first time, the browser asks for microphone permission. Allow it. Use **Safari** (Mac/iPhone) or **Chrome**; Firefox can't transcribe speech. Your speech is transcribed by Apple (Safari) or Google (Chrome); only the text reaches Maverick.

---

## Connect Google Calendar (read-only, about 20 minutes, once)

Google requires every app, even a private one, to have its own sign-in credentials. Maverick asks only for **read-only** calendar access.

1. Go to <https://console.cloud.google.com>, sign in with your Google account, and create a project named **Maverick**.
2. **APIs & Services → Library**: search "Google Calendar API" and click **Enable**.
3. **APIs & Services → OAuth consent screen** (may be called "Google Auth Platform"):
   - User type: **External**. App name: Maverick. Support email and developer email: yours.
   - Scopes: add `.../auth/calendar.readonly`.
   - Test users: add your own Gmail address.
   - **Publish the app** ("In production"). Otherwise Google expires the connection every 7 days. Because it's unverified, Google will warn you when you connect; that's expected for a private app. Click Advanced → Continue.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorised redirect URI: `http://localhost:3000/api/integrations/google/callback`
   - Create. Copy the **Client ID** and **Client secret**.
5. On the Mac: run `pnpm configure`, answer yes to Google Calendar, and paste both. Restart Maverick.
6. **On the Mac**, open <http://localhost:3000/settings> → **Connect Google Calendar** and approve.

Disconnect any time in Settings; it also revokes Maverick's access at Google.

---

## Where things are

| Screen | What it does |
|---|---|
| Command Center | Greeting, briefing, today's agenda, top priorities (tick to complete), suggestion inbox, goals, spend |
| Conversation | Chat. Each reply shows the model, why it was chosen, and the cost. **Context used** shows which memories Maverick saw and why. Suggestions appear as chips with Accept/✕. |
| Goals & Tasks | Inbox, tasks (priority, due date, reminder, linked goal), goals with measurable outcomes |
| Memory Vault | Search, add, edit, pin, delete; retention per memory; provenance for each; export |
| Usage & Budget | Spend by day and model |
| Security | Signed-in devices, connected accounts with their exact permissions, audit log |
| Settings | Calendar, notifications, daily rhythm and proactivity, personality, "About me", budget, model routing, data export, password |

**Budget defaults:** at $30/month Maverick warns and switches to the cheapest model; it stops at $40/month or $5/day. Briefings never fail on budget: they fall back to a free version built from your data.

---

## Backups

Your data is in `~/maverick/data/` plus the encryption key (Keychain or `.env`). Back up both. Or use **Settings → Export all data** for a readable JSON copy.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "MAVERICK_DATA_KEY is missing" | `pnpm configure` |
| Yellow "Mock mode" banner | No API key found: `pnpm configure`, then restart |
| "The Anthropic API key was rejected" | Create a new key, `pnpm configure`, restart |
| No 05:30 briefing | Was Maverick running and the Mac awake? See step 4. Check Settings → Daily rhythm. |
| No notifications on iPhone | Opened from the home-screen icon? Via the Tailscale **https** address? "Allow push notifications" ticked and saved? Try **Send a test**. |
| "Cross-site request blocked" via Tailscale | Set `MAVERICK_ALLOWED_ORIGINS` (iPhone section, step 4) and restart |
| Google: "Access blocked" or a 7-day expiry | Consent screen must be **In production**, your address listed as a test user, and the redirect URI exact |
| "port 3000 already in use" | Maverick is already running in another Terminal window |

Never run two copies of Maverick at once: the embedded database allows one at a time.

---

## For developers

```bash
pnpm dev          # dev server with hot reload on :3000
pnpm test         # core unit + integration tests (Vitest)
pnpm test:e2e     # browser tests (Playwright; run `pnpm build` first)
pnpm typecheck
```

Useful env vars for trying things out: `MAVERICK_LLM_PROVIDER=mock`, `MAVERICK_CALENDAR_PROVIDER=mock`, `MAVERICK_SCHEDULER=off`.

Docs: `docs/architecture.md`, `docs/threat-model.md`, `docs/budget.md`, `docs/adr/`. Progress and next steps: `PROGRESS.md`.
