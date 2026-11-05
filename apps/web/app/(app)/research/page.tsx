import { getSettings, TEMPLATES } from "@maverick/core";
import { MissionLauncher, MissionList, type UiMission } from "@/components/Missions";
import { getMaverick, requireUser } from "@/lib/server";

export default async function Research() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const live = m.providers.mode === "live";
  const missions = (JSON.parse(JSON.stringify(await m.agent.list(user.id, { limit: 100 }))) as UiMission[]).filter((x) => x.template === "research_brief");
  const t = TEMPLATES.find((x) => x.id === "research_brief")!;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">10 · Intelligence agent</span>
          <h1>Research</h1>
          <p>Sourced answers from the web, combined with what Maverick already knows about you.</p>
        </div>
      </div>
      <div className="cards">
        {!live && (
          <div className="alert alert-warn span-12" style={{ margin: 0 }}>
            <strong>Web research needs the live AI model.</strong> In mock mode a research mission still checks your memories, but the web step is skipped (and says so). Add an Anthropic API key to enable it.
          </div>
        )}
        <section className="card span-12" aria-labelledby="h-q">
          <div className="card-head"><h3 id="h-q">New research brief</h3><span className="tele">≈ $0.05–0.15 per brief · medium risk</span></div>
          <MissionLauncher templates={[{ id: t.id, label: t.label, description: t.description, params: t.params }]} globalMode={settings.agent.mode} live={live} preset="research_brief" />
        </section>
        <section className="card span-12" aria-labelledby="h-past">
          <div className="card-head"><h3 id="h-past">Briefs</h3><span className="tele">{missions.length}</span></div>
          <MissionList missions={missions} empty="No research yet." />
        </section>
      </div>
    </div>
  );
}
