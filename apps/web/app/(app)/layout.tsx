import { getSettings } from "@maverick/core";
import { Shell } from "@/components/Shell";
import { getMaverick, requireUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  return (
    <div data-reduce-motion={String(settings.ui.reduceMotion)}>
      <Shell mode={m.providers.mode}>{children}</Shell>
    </div>
  );
}
