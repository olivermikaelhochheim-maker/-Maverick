import { listAudit, listSessions } from "@maverick/core";
import { SessionsPanel } from "@/components/SessionsPanel";
import { getMaverick, getSessionToken, requireUser } from "@/lib/server";

const SCOPE_LABELS: Record<string, string> = {
  "https://www.googleapis.com/auth/calendar.readonly": "Read your calendars (read-only)",
  openid: "Confirm your Google identity",
  email: "See your email address (to show which account is connected)",
  "https://www.googleapis.com/auth/userinfo.email": "See your email address (to show which account is connected)",
};

const ACTION_LABELS: Record<string, string> = {
  "memory.created": "Memory saved",
  "memory.updated": "Memory edited",
  "memory.deleted": "Memory deleted",
  "memory.expired": "Expired memories removed",
  "goal.created": "Goal added",
  "goal.updated": "Goal updated",
  "goal.deleted": "Goal deleted",
  "task.created": "Task added",
  "task.updated": "Task updated",
  "task.completed": "Task completed",
  "task.deleted": "Task deleted",
  "suggestion.proposed": "Maverick made a suggestion",
  "suggestion.accepted": "Suggestion accepted",
  "suggestion.dismissed": "Suggestion dismissed",
  "briefing.morning": "Morning briefing",
  "briefing.evening": "Evening check-in",
  "briefing.weekly": "Weekly review",
  "integration.connected": "Account connected",
  "integration.disconnected": "Account disconnected",
  "integration.needs_reauth": "Account needs reconnecting",
  "notifications.device_added": "Notifications enabled on a device",
  "notifications.device_removed": "Notifications turned off on a device",
  "data.exported": "Data exported",
  "account.created": "Account created",
  "login.succeeded": "Signed in",
  "login.failed": "Failed sign-in attempt",
  "login.locked": "Sign-in temporarily locked (too many failures)",
  logout: "Signed out",
  "session.revoked": "Signed out a device",
  "session.revoked_others": "Signed out all other devices",
  "password.changed": "Password changed",
  "settings.updated": "Settings changed",
  "conversation.deleted": "Conversation deleted",
  "budget.soft_limit_reached": "Monthly soft budget limit reached",
  "setup.rejected": "Setup attempt with wrong code",
};

export default async function SecurityPage() {
  const user = await requireUser();
  const m = await getMaverick();
  const sessions = await listSessions(m.db, user.id, await getSessionToken());
  const audit = await listAudit(m.db, user.id, 200);
  const integrations = await m.integrations.list(user.id);
  const devices = await m.notifier.deviceCount(user.id);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Security</h1>
          <p>Signed-in devices, connected accounts and a record of every security-relevant action.</p>
        </div>
      </div>
      <div className="cards">
        <section className="card span-6">
          <h3>Signed-in devices</h3>
          <SessionsPanel initial={sessions} />
        </section>
        <section className="card span-6">
          <h3>Connected accounts &amp; permissions</h3>
          {integrations.length === 0 ? (
            <p className="empty">None. Maverick has no access to any outside account.</p>
          ) : (
            <ul className="list-plain">
              {integrations.map((i) => (
                <li key={i.id}>
                  <div className="item">
                    Google {i.accountEmail && <span className="muted">({i.accountEmail})</span>}{" "}
                    {i.status === "needs_reauth" ? <span className="badge badge-warn">needs reconnecting</span> : <span className="badge badge-accent">active</span>}
                    <ul className="small muted" style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem" }}>
                      {i.scopes.map((s) => (
                        <li key={s}>{SCOPE_LABELS[s] ?? s}</li>
                      ))}
                    </ul>
                    <p className="hint">Connected {new Date(i.createdAt).toLocaleDateString("en-GB")} · <a href="/settings#calendar">Manage or revoke</a></p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="small muted" style={{ marginTop: "0.6rem" }}>
            Push notifications: {devices} device{devices === 1 ? "" : "s"} registered. Maverick can read; it cannot send, book, buy, post or change anything outside itself.
          </p>
        </section>
        <section className="card span-12">
          <h3>Audit log</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id}>
                    <td className="small" style={{ whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString("en-GB")}</td>
                    <td className="small">{e.actor}</td>
                    <td>{ACTION_LABELS[e.action] ?? e.action}</td>
                    <td className="small faint"><code>{Object.keys(e.details).length ? JSON.stringify(e.details) : ""}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
