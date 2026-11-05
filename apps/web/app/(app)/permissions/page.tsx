import { getSettings, MODE_SUMMARIES, toolCatalog } from "@maverick/core";
import { PermissionsView } from "@/components/Permissions";
import { getMaverick, requireUser } from "@/lib/server";

export default async function Permissions() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">13 · Permissions</span>
          <h1>Autonomy & permissions</h1>
          <p>How much Maverick may do on his own. Changes take effect at the next step that runs.</p>
        </div>
      </div>
      <PermissionsView initial={settings.agent} tools={toolCatalog(m.agent.env)} summaries={MODE_SUMMARIES as unknown as Record<string, string>} />
    </div>
  );
}
