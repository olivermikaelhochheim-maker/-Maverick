"use client";

import { useState } from "react";
import type { Settings } from "@maverick/core";
import { api } from "@/lib/client";

const MODEL_OPTIONS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5: $0.10 / $0.50 per M tokens" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5: $2 / $10 per M tokens" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5: $4 / $20 per M tokens" },
];

const COMMON_TZ = ["Europe/Oslo", "UTC", "Europe/London", "Europe/Stockholm", "Europe/Berlin", "Europe/Warsaw", "America/New_York", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney"];

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState<Settings>(initial);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const tzOptions = Array.from(new Set([s.timezone, browserTz, ...COMMON_TZ]));

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((prev) => ({ ...prev, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const { settings } = await api<{ settings: Settings }>("/api/settings", { method: "PUT", body: s });
      setS(settings);
      setStatus({ kind: "ok", text: "Saved." });
      document.body.dataset.reduceMotion = String(settings.ui.reduceMotion);
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <form onSubmit={save}>
      <div className="cards">
        <section className="card span-6" aria-labelledby="h-general">
          <h2 id="h-general">General</h2>
          <div className="field">
            <label htmlFor="tz">Time zone</label>
            <select id="tz" value={s.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>{tz}{tz === browserTz ? " (this device)" : ""}</option>
              ))}
            </select>
            <p className="hint">Used for greetings, briefings, reminders and quiet hours.</p>
          </div>
          <label className="check field">
            <input type="checkbox" checked={s.ui.reduceMotion} onChange={(e) => set("ui", { ...s.ui, reduceMotion: e.target.checked })} />
            Reduce motion (stop the orb animations)
          </label>
        </section>

        <section className="card span-6" aria-labelledby="h-personality">
          <h2 id="h-personality">Personality</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="wit">Wit</label>
              <select id="wit" value={s.personality.wit} onChange={(e) => set("personality", { ...s.personality, wit: e.target.value as Settings["personality"]["wit"] })}>
                <option value="low">Low: composed, minimal humour</option>
                <option value="medium">Medium: occasional dry wit</option>
                <option value="high">High: frequent dry wit</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="directness">Directness</label>
              <select id="directness" value={s.personality.directness} onChange={(e) => set("personality", { ...s.personality, directness: e.target.value as Settings["personality"]["directness"] })}>
                <option value="gentle">Gentle</option>
                <option value="balanced">Balanced</option>
                <option value="blunt">Blunt</option>
              </select>
            </div>
          </div>
        </section>

        <section className="card span-12" aria-labelledby="h-schedule">
          <h2 id="h-schedule">Daily rhythm &amp; proactivity</h2>
          <p className="muted small">
            When Maverick reaches out on its own. Briefings appear as conversations; notifications go only to devices you&apos;ve enabled below, never during quiet hours.
          </p>
          <div className="form-grid">
            <div className="field">
              <label className="check" style={{ marginBottom: "0.4rem" }}>
                <input type="checkbox" checked={s.proactive.morningBriefing} onChange={(e) => set("proactive", { ...s.proactive, morningBriefing: e.target.checked })} />
                Morning briefing
              </label>
              <label htmlFor="brief" className="sr-only">Morning briefing time</label>
              <input id="brief" type="time" value={s.schedule.briefingTime} onChange={(e) => set("schedule", { ...s.schedule, briefingTime: e.target.value })} />
            </div>
            <div className="field">
              <label className="check" style={{ marginBottom: "0.4rem" }}>
                <input type="checkbox" checked={s.proactive.eveningCheckIn} onChange={(e) => set("proactive", { ...s.proactive, eveningCheckIn: e.target.checked })} />
                Evening check-in
              </label>
              <label htmlFor="checkin" className="sr-only">Evening check-in time</label>
              <input id="checkin" type="time" value={s.schedule.checkInTime} onChange={(e) => set("schedule", { ...s.schedule, checkInTime: e.target.value })} />
            </div>
            <div className="field">
              <label className="check" style={{ marginBottom: "0.4rem" }}>
                <input type="checkbox" checked={s.proactive.weeklyReview} onChange={(e) => set("proactive", { ...s.proactive, weeklyReview: e.target.checked })} />
                Weekly review
              </label>
              <div className="row time-pair">
                <label htmlFor="wday" className="sr-only">Weekly review day</label>
                <select id="wday" value={s.schedule.weeklyReview.day} onChange={(e) => set("schedule", { ...s.schedule, weeklyReview: { ...s.schedule.weeklyReview, day: Number(e.target.value) } })}>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
                <label htmlFor="wtime" className="sr-only">Weekly review time</label>
                <input id="wtime" type="time" value={s.schedule.weeklyReview.time} onChange={(e) => set("schedule", { ...s.schedule, weeklyReview: { ...s.schedule.weeklyReview, time: e.target.value } })} />
              </div>
            </div>
            <div className="field">
              <label>Quiet hours (no notifications)</label>
              <div className="row time-pair">
                <label htmlFor="qstart" className="sr-only">Quiet hours start</label>
                <input id="qstart" type="time" value={s.schedule.quietHours.start} onChange={(e) => set("schedule", { ...s.schedule, quietHours: { ...s.schedule.quietHours, start: e.target.value } })} />
                <span className="muted">to</span>
                <label htmlFor="qend" className="sr-only">Quiet hours end</label>
                <input id="qend" type="time" value={s.schedule.quietHours.end} onChange={(e) => set("schedule", { ...s.schedule, quietHours: { ...s.schedule.quietHours, end: e.target.value } })} />
              </div>
            </div>
          </div>
          <label className="check field">
            <input type="checkbox" checked={s.proactive.suggestFromChat} onChange={(e) => set("proactive", { ...s.proactive, suggestFromChat: e.target.checked })} />
            Let Maverick suggest memories, tasks, goals and actions (they wait in your inbox for approval)
          </label>
          <div className="grid-2">
            <label className="check field">
              <input type="checkbox" checked={s.notifications.enabled} onChange={(e) => set("notifications", { ...s.notifications, enabled: e.target.checked })} />
              Allow push notifications
            </label>
            <div className="field">
              <label htmlFor="maxn">Max notifications per day</label>
              <input id="maxn" type="number" min={0} max={50} step={1} value={s.notifications.maxPerDay} onChange={(e) => set("notifications", { ...s.notifications, maxPerDay: num(e.target.value) })} />
            </div>
          </div>
        </section>

        <section className="card span-12" aria-labelledby="h-about">
          <h2 id="h-about">About me</h2>
          <p className="muted small">
            Maverick reads this with every message. Keep it to facts you&apos;ve chosen to share. It&apos;s stored encrypted, and sent to the
            model provider (Anthropic) with each message so Maverick has the context. For individual facts with sources and expiry, use the Memory Vault.
          </p>
          <label htmlFor="about" className="sr-only">About me</label>
          <textarea id="about" rows={10} value={s.aboutMe} onChange={(e) => set("aboutMe", e.target.value)} maxLength={8000} />
          <p className="hint">{s.aboutMe.length.toLocaleString()} / 8,000 characters. Longer notes cost slightly more per message.</p>
        </section>

        <section className="card span-6" aria-labelledby="h-budget">
          <h2 id="h-budget">Budget (model usage)</h2>
          <p className="muted small">Limits apply to AI model calls Maverick makes. Hosting and other subscriptions are separate.</p>
          <div className="field">
            <label htmlFor="soft">Monthly soft limit (USD)</label>
            <input id="soft" type="number" min={0} step="0.01" value={s.budget.monthlySoftUsd} onChange={(e) => set("budget", { ...s.budget, monthlySoftUsd: num(e.target.value) })} />
            <p className="hint">Past this, Maverick warns you and switches to the cheapest model.</p>
          </div>
          <div className="field">
            <label htmlFor="hard">Monthly hard limit (USD)</label>
            <input id="hard" type="number" min={0} step="0.01" value={s.budget.monthlyHardUsd} onChange={(e) => set("budget", { ...s.budget, monthlyHardUsd: num(e.target.value) })} />
            <p className="hint">Past this, model calls stop until next month or until you raise it.</p>
          </div>
          <div className="field">
            <label htmlFor="daily">Daily hard limit (USD)</label>
            <input id="daily" type="number" min={0} step="0.01" value={s.budget.dailyHardUsd} onChange={(e) => set("budget", { ...s.budget, dailyHardUsd: num(e.target.value) })} />
            <p className="hint">Stops a runaway day from eating the month. Periods reset at midnight UTC.</p>
          </div>
        </section>

        <section className="card span-6" aria-labelledby="h-routing">
          <h2 id="h-routing">Model routing</h2>
          <div className="field">
            <label htmlFor="mode">Mode</label>
            <select id="mode" value={s.routing.mode} onChange={(e) => set("routing", { ...s.routing, mode: e.target.value as Settings["routing"]["mode"] })}>
              <option value="auto">Auto: fast model for quick chat, standard for analysis</option>
              <option value="fast">Always fast</option>
              <option value="standard">Always standard</option>
              <option value="deep">Always deep (most expensive)</option>
            </select>
          </div>
          {(["fast", "standard", "deep"] as const).map((tier) => (
            <div className="field" key={tier}>
              <label htmlFor={`m-${tier}`}>{tier[0]!.toUpperCase() + tier.slice(1)} tier model</label>
              <select id={`m-${tier}`} value={s.routing.models[tier]} onChange={(e) => set("routing", { ...s.routing, models: { ...s.routing.models, [tier]: e.target.value } })}>
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          ))}
          <div className="grid-2">
            <div className="field">
              <label htmlFor="hist">History sent (tokens)</label>
              <input id="hist" type="number" min={1000} max={100000} step={1} value={s.routing.historyTokenBudget} onChange={(e) => set("routing", { ...s.routing, historyTokenBudget: num(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor="maxout">Max reply (tokens)</label>
              <input id="maxout" type="number" min={256} max={32000} step={1} value={s.routing.maxOutputTokens} onChange={(e) => set("routing", { ...s.routing, maxOutputTokens: num(e.target.value) })} />
            </div>
          </div>
        </section>
      </div>

      <div className="row" style={{ marginTop: "1rem", position: "sticky", bottom: "calc(var(--tabbar-h) * 0 + 1rem)" }}>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
        {status && <span role="status" className={status.kind === "ok" ? "muted" : ""} style={status.kind === "error" ? { color: "var(--danger)" } : undefined}>{status.text}</span>}
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        if (f.get("newPassword") !== f.get("confirm")) return setStatus({ kind: "error", text: "New passwords don't match." });
        try {
          await api("/api/account/password", { body: { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") } });
          form.reset();
          setStatus({ kind: "ok", text: "Password changed. Other devices were signed out." });
        } catch (err) {
          setStatus({ kind: "error", text: (err as Error).message });
        }
      }}
    >
      {status && <div className={`alert ${status.kind === "ok" ? "alert-ok" : "alert-error"}`} role="status">{status.text}</div>}
      <div className="field">
        <label htmlFor="cur">Current password</label>
        <input id="cur" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="np">New password</label>
          <input id="np" name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
        </div>
        <div className="field">
          <label htmlFor="np2">Confirm</label>
          <input id="np2" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
        </div>
      </div>
      <button className="btn">Change password</button>
    </form>
  );
}
