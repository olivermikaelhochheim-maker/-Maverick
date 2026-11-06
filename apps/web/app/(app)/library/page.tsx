import { DOMAIN_LABELS, getSettings } from "@maverick/core";
import { LibraryView } from "@/components/LibraryView";
import { getMaverick, requireUser } from "@/lib/server";

export default async function Library() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const overview = await m.library.overview(user, settings);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">System · Task library</span>
          <h1>Task library</h1>
          <p>232 researched tasks for your degree, pilot path, Zorza, money, physique, discipline and life. Maverick suggests the right few each day.</p>
        </div>
      </div>
      <LibraryView
        initial={JSON.parse(JSON.stringify(overview))}
        labels={DOMAIN_LABELS}
        settings={{ library: settings.library, proactive: { overnightPrep: settings.proactive.overnightPrep }, notifications: { middayDigest: settings.notifications.middayDigest } }}
      />
    </div>
  );
}
