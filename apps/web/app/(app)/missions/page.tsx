import { getSettings, TEMPLATES } from "@maverick/core";
import { MissionLauncher, MissionList, type UiMission } from "@/components/Missions";
import { Approvals } from "@/components/IntelPanel";
import { getMaverick, requireUser } from "@/lib/server";

export default async function MissionControl({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const { t } = await searchParams;
  const missions = JSON.parse(JSON.stringify(await m.agent.list(user.id, { limit: 60 }))) as UiMission[];
  const active = missions.filter((x) => ["proposed", "running", "awaiting_approval", "paused"].includes(x.status));
  const history = missions.filter((x) => !active.includes(x));
  const templates = TEMPLATES.map((x) => ({ id: x.id, label: x.label, description: x.description, params: x.params }));
  const done = history.filter((x) => x.status === "completed").length;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">03 · Mission Control</span>
          <h1>Missions</h1>
          <p>Objective → plan → operations → execution → review. Plans are fixed at launch; nothing a step reads can add steps.</p>
        </div>
      </div>
      <div className="cards">
        <section className="card span-8" aria-labelledby="h-new">
          <div className="card-head"><h3 id="h-new">New mission</h3></div>
          <MissionLauncher templates={templates} globalMode={settings.agent.mode} live={m.providers.mode === "live"} preset={templates.some((x) => x.id === t) ? t : undefined} />
        </section>
        <section className="card span-4 alert-panel" aria-labelledby="h-appr">
          <div className="card-head"><h3 id="h-appr">Waiting for you</h3></div>
          <Approvals />
        </section>
        <section className="card span-12" aria-labelledby="h-active">
          <div className="card-head"><h3 id="h-active">Active</h3><span className="tele">{active.length}</span></div>
          <MissionList missions={active} empty="No active missions." />
        </section>
        <section className="card span-12" aria-labelledby="h-hist">
          <div className="card-head"><h3 id="h-hist">History</h3><span className="tele">{done} completed · {history.length - done} other</span></div>
          <MissionList missions={history} empty="No finished missions yet." />
        </section>
      </div>
    </div>
  );
}
