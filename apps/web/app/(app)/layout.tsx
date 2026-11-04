import { getSettings, localParts } from "@maverick/core";
import { Shell } from "@/components/Shell";
import { getMaverick, requireUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  // Live counters for the navigation.
  const today = localParts(settings.timezone).date;
  const [pending, open] = await Promise.all([m.deps.suggestions.list(user.id, "pending", 100), m.deps.planning.listTasks(user.id, { limit: 500 })]);
  const counts = {
    "/planning": { n: pending.length + open.filter((t) => t.dueDate && t.dueDate < today).length, alert: open.some((t) => t.dueDate && t.dueDate < today) },
  };
  return (
    <div data-reduce-motion={String(settings.ui.reduceMotion)}>
      <Shell mode={m.providers.mode} counts={counts}>{children}</Shell>
    </div>
  );
}
