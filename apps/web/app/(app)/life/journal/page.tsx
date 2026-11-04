import { getSettings, localParts } from "@maverick/core";
import { Journal } from "@/components/life/Journal";
import { getMaverick, requireUser } from "@/lib/server";

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ entry?: string; new?: string }> }) {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const { entry, new: startNew } = await searchParams;
  const entries = await m.deps.life!.listEntries(user.id, { limit: 200 });
  return <Journal initial={entries} today={localParts(settings.timezone).date} openId={entry} startNew={startNew === "1"} />;
}
