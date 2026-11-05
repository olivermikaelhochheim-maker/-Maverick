import { CommsView } from "@/components/Comms";
import { getMaverick, requireUser } from "@/lib/server";

export default async function Comms() {
  const user = await requireUser();
  const m = await getMaverick();
  const drafts = JSON.parse(JSON.stringify(await m.agent.drafts.list(user.id)));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">09 · Communications agent</span>
          <h1>Communications</h1>
          <p>Email drafts for your review. Maverick drafts; you send from your own mail app.</p>
        </div>
      </div>
      <CommsView initial={drafts} live={m.providers.mode === "live"} name={user.displayName} />
    </div>
  );
}
