import { getSettings, listAudit } from "@maverick/core";
import { LogsView } from "@/components/LogsView";
import { getMaverick, requireUser } from "@/lib/server";

export default async function Logs() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const [events, auditLog] = await Promise.all([m.agent.events(user.id, { limit: 300 }), listAudit(m.db, user.id, 300)]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">12 · Logs</span>
          <h1>Logs</h1>
          <p>Everything the agents did, and everything that changed. Agent messages are stored encrypted.</p>
        </div>
      </div>
      <LogsView events={JSON.parse(JSON.stringify(events))} audit={JSON.parse(JSON.stringify(auditLog))} tz={settings.timezone} />
    </div>
  );
}
