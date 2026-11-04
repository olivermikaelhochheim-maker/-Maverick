import { getSettings, localParts } from "@maverick/core";
import { LifeToday } from "@/components/life/LifeToday";
import { getMaverick, requireUser } from "@/lib/server";

export default async function LifePage() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const overview = await m.deps.life!.overview(user.id, localParts(settings.timezone).date);
  return <LifeToday initial={overview} />;
}
