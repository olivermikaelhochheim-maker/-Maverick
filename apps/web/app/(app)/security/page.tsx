import { listAudit, listSessions } from "@maverick/core";
import { SessionsPanel } from "@/components/SessionsPanel";
import { getMaverick, getSessionToken, requireUser } from "@/lib/server";

const ACTION_LABELS: Record<string, string> = {
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
          <p className="empty">None. Maverick has no access to any outside account.</p>
          <p className="phase-note">
            Calendar, email and tasks arrive in Phase 4 via official sign-in (OAuth), with the exact permissions listed here and a revoke button for each.
            All external actions will require your confirmation.
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
