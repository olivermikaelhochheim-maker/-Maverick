import { getSettings, localParts } from "@maverick/core";
import { LifeHabits } from "@/components/life/LifeHabits";
import { getMaverick, requireUser } from "@/lib/server";

export default async function HabitsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const today = localParts(settings.timezone).date;
  const life = m.deps.life!;
  const [week, history, goals] = await Promise.all([life.week(user.id, today, today), life.history(user.id, today, 8), m.deps.planning.listGoals(user.id)]);
  const { new: startNew } = await searchParams;
  return <LifeHabits initial={week} history={history} goals={goals} today={today} startNew={startNew === "1"} />;
}
