import { getSettings, localParts } from "@maverick/core";
import { Planning } from "@/components/Planning";
import { SuggestionInbox } from "@/components/SuggestionInbox";
import { getMaverick, requireUser } from "@/lib/server";

export default async function PlanningPage() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const [goals, tasks, suggestions] = await Promise.all([
    m.deps.planning.listGoals(user.id),
    m.deps.planning.listTasks(user.id),
    m.deps.suggestions.list(user.id, "pending"),
  ]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Goals &amp; tasks</h1>
          <p>What you&apos;re working towards, and the next actions that move it.</p>
        </div>
      </div>
      <section className="card" id="inbox" style={{ marginBottom: "1rem" }} aria-labelledby="h-inbox">
        <h2 id="h-inbox">Suggestion inbox {suggestions.length > 0 && <span className="badge badge-accent">{suggestions.length}</span>}</h2>
        <SuggestionInbox initial={suggestions} />
      </section>
      <Planning initialGoals={goals} initialTasks={tasks} today={localParts(settings.timezone).date} />
    </div>
  );
}
