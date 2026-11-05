import { TEMPLATES } from "@maverick/core";
import { AutomationsView } from "@/components/Automations";
import { getMaverick, requireUser } from "@/lib/server";

export default async function Automations() {
  const user = await requireUser();
  const m = await getMaverick();
  const autos = JSON.parse(JSON.stringify(await m.agent.listAutomations(user.id)));
  const templates = TEMPLATES.filter((t) => t.params.every((p) => !p.required) || t.id === "research_brief").map((t) => ({ id: t.id, label: t.label, description: t.description, params: t.params }));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">11 · Automations</span>
          <h1>Automations</h1>
          <p>Recurring missions. The server checks once a minute; your permissions apply to every run.</p>
        </div>
      </div>
      <AutomationsView initial={autos} templates={templates} />
    </div>
  );
}
