import Link from "next/link";
import { getSettings } from "@maverick/core";
import { LogoutButton } from "@/components/AuthForms";
import { CalendarPanel } from "@/components/CalendarPanel";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { PasswordForm, SettingsForm } from "@/components/SettingsForm";
import { getMaverick, requireUser } from "@/lib/server";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string; google?: string }> }) {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const google = await m.integrations.get(user.id, "google");
  const { welcome, google: googleFlash } = await searchParams;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Signed in as {user.email}</p>
        </div>
        <LogoutButton />
      </div>
      <nav className="settings-links mobile-only" aria-label="More">
        <Link className="btn btn-sm" href="/usage">Usage &amp; budget</Link>
        <Link className="btn btn-sm" href="/security">Security &amp; audit log</Link>
      </nav>
      {welcome && (
        <div className="alert alert-ok">
          Account created. Check your time zone and the &quot;About me&quot; notes below, then head to Conversation.
        </div>
      )}
      <div className="cards" style={{ marginBottom: "1rem" }}>
        <section className="card span-6" id="calendar" aria-labelledby="h-cal">
          <h2 id="h-cal">Google Calendar</h2>
          <CalendarPanel
            mode={m.calendarMode}
            connected={google ? { email: google.accountEmail, status: google.status, scopes: google.scopes } : null}
            flash={googleFlash}
          />
        </section>
        <section className="card span-6" aria-labelledby="h-notif">
          <h2 id="h-notif">Notifications on this device</h2>
          <NotificationsPanel serverConfigured={m.notifier.configured} consent={settings.notifications.enabled} />
        </section>
      </div>
      <SettingsForm initial={settings} />
      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Your data</h2>
        <p className="muted small">Download everything Maverick holds about you (conversations, memories, goals, tasks, settings, audit log) as one JSON file.</p>
        <a className="btn btn-sm" href="/api/export">Export all data</a>
      </section>
      <section className="card">
        <h2>Password</h2>
        <PasswordForm />
      </section>
      <section className="card">
        <h2>Voice</h2>
        <p className="empty">Not available yet. Push-to-talk with a licensed British voice is the next milestone, after you pick a voice from samples.</p>
      </section>
    </div>
  );
}
