import { getSettings, localParts } from "@maverick/core";
import { HealthView } from "@/components/HealthView";
import { getMaverick, requireUser } from "@/lib/server";

export default async function Health() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const today = localParts(settings.timezone).date;
  const [trends, entries] = await Promise.all([m.agent.health.trends(user.id, today), m.agent.health.list(user.id)]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">08 · Performance agent</span>
          <h1>Health & Performance</h1>
          <p>Training, sleep, energy and weight from your own logs. Physique, discipline, money: this is the first one.</p>
        </div>
      </div>
      <HealthView initial={JSON.parse(JSON.stringify({ trends, entries: entries.slice(0, 100), today }))} />
    </div>
  );
}
