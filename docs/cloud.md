# Run Maverick in the cloud (Render)

One address that works on every device, briefings at 05:30 whether or not your Mac is on, and no Tailscale. About 30 minutes, once.

**Cost:** about **$7.25/month** for hosting (Render "Starter" server $7 + 1 GB disk $0.25), plus your Claude usage. Check current prices at <https://render.com/pricing> before you start.

---

## 1. Create a Render account (5 min)

1. Go to <https://render.com> → **Get Started** → **sign up with GitHub** (easiest: it lets Render see your Maverick repository).
2. When GitHub asks which repositories Render may access, choose **Only select repositories** → **-Maverick**.
3. In Render: your avatar → **Billing** → add a card.

## 2. Create Maverick from the blueprint (10 min, mostly waiting)

1. In Render: **New +** → **Blueprint**.
2. Pick the **-Maverick** repository. Render reads the `render.yaml` file in it and shows one service called **maverick** (Starter plan, Frankfurt, 1 GB disk).
3. It asks for **ANTHROPIC_API_KEY**: paste your key (the same one as on your Mac).
4. Click **Apply** / **Deploy Blueprint**. The first build takes about 5–10 minutes. Watch **Logs**; it's done when you see `Ready` and `scheduler_started`.
5. At the top of the service page you'll see your address, like **https://maverick-ab12.onrender.com**.

## 3. Save two values from Render (2 min, important)

In Render → **maverick** → **Environment**:

- **MAVERICK_DATA_KEY**: click the eye icon and copy it into your **password manager**. It encrypts all your data. Without it, a backup can't be read.
- **MAVERICK_SETUP_CODE**: copy it; you need it in the next step.

## 4. Create your account and two-step login (5 min)

1. Open your Render address. You'll see **Welcome to Maverick**.
2. Enter the setup code, your name, email and a password (at least 12 characters).
3. **Two-step login** (required on the internet): tap **Set up two-step login**.
   - On a computer: scan the QR code with your iPhone camera and choose **Add verification code in Passwords** (or use Google/Microsoft Authenticator).
   - On the iPhone itself: copy the **setup key** into your authenticator app.
   - Type the 6-digit code to confirm.
4. **Save the 10 recovery codes** in your password manager. Each lets you in once if you lose your phone.

From now on, signing in means your password plus the current 6-digit code from your phone.

## 5. Move your data from the Mac (3 min)

1. On the **Mac's** Maverick: **Settings → Your data → Export all data**. A file `maverick-export-….json` downloads.
2. On the **cloud** Maverick: **Settings → Your data → Import → Choose export file…** and pick that file.
3. Your memories, goals, tasks, conversations, settings and this month's spend come across. (Import only works into a fresh Maverick, so it can't create duplicates.)
4. You can now stop the Mac version (Ctrl+C in Terminal). Keep the export file as a backup.

## 6. Use it everywhere

- **iPhone:** open the address in Safari → Share → **Add to Home Screen**. Open it from that icon → **More → Settings → Notifications on this device → Enable**, and tick **Allow push notifications** under Daily rhythm. No Tailscale needed any more.
- **Mac / Windows PC / any browser:** open the address and sign in. For voice on Windows, use Microsoft Edge.

## 7. Google Calendar in the cloud (optional, 5 min)

1. Google Cloud Console → **APIs & Services → Credentials** → your OAuth client → **Authorised redirect URIs** → **Add URI**:
   `https://YOUR-ADDRESS.onrender.com/api/integrations/google/callback` → Save.
2. Render → maverick → **Environment** → **Add Environment Variable**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (same values as on the Mac) → **Save Changes**. Render restarts Maverick (about a minute).
3. Maverick → **Settings → Google Calendar → Connect**. This now works from any device.

---

## Updates

When I push an update to GitHub, Render rebuilds and restarts Maverick automatically. Expect about a minute offline during each update. Your data is on the disk and isn't touched.

## Backups

Once a month (or before anything big): **Settings → Export all data**, and keep the file somewhere safe. The file is decrypted, readable JSON, so treat it like a private document.

## If something goes wrong

| Symptom | Fix |
|---|---|
| Deploy failed | Render → maverick → **Logs**: copy the last red lines and send them to me |
| "MAVERICK_DATA_KEY is missing" | Environment → check the key exists (never change it once you have data) |
| Lost your phone | Sign in with a recovery code, then Security → **New recovery codes**, and set up the new phone |
| Lost phone **and** recovery codes | Render → Shell: tell me first; there's a careful way to reset two-step login |
| Mock-mode banner | Environment → `ANTHROPIC_API_KEY` is empty or wrong |

## Optional: your own address

Render → maverick → **Settings → Custom Domains** lets you use something like `maverick.zorza.no` instead of the onrender.com address. After changing it, update the Google redirect URI to match and add `MAVERICK_PUBLIC_URL=https://maverick.zorza.no` in Environment.
