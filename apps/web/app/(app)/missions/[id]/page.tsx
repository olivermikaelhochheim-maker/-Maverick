import { notFound } from "next/navigation";
import Link from "next/link";
import { getSettings } from "@maverick/core";
import { MissionView, type UiMission } from "@/components/Missions";
import { getMaverick, requireUser } from "@/lib/server";

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const m = await getMaverick();
  const { id } = await params;
  const mission = await m.agent.get(user.id, id);
  if (!mission) notFound();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const events = await m.agent.events(user.id, { missionId: id, limit: 200 });
  return (
    <div className="page">
      <p className="small" style={{ marginBottom: "0.8rem" }}><Link href="/missions">← Mission Control</Link></p>
      <MissionView key={id} initial={JSON.parse(JSON.stringify(mission)) as UiMission} initialEvents={JSON.parse(JSON.stringify(events))} tz={settings.timezone} />
    </div>
  );
}
