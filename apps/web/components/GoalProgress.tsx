import type { GoalProgress as G } from "@maverick/core";
import { Meter } from "./viz";

export function GoalProgressList({ goals }: { goals: G[] }) {
  if (!goals.length) {
    return (
      <p className="empty">
        No goals yet. <a href="/planning">Add your first</a>; progress is measured by the tasks you link to it.
      </p>
    );
  }
  return (
    <div>
      {goals.slice(0, 5).map((g) => {
        const pct = g.total ? g.done / g.total : 0;
        return (
          <div key={g.id} className="goal-row">
            <div className="top">
              <span className="name">{g.title}</span>
              <span className="pct">{g.total ? `${Math.round(pct * 100)}% · ${g.done}/${g.total}` : "no tasks yet"}</span>
            </div>
            <Meter value={pct} label={`${g.title}: ${Math.round(pct * 100)}% of linked tasks done`} />
            <div className="meta">
              {g.metric ? `Measured by: ${g.metric}` : "Add a metric to make it measurable"}
              {g.daysLeft !== null && ` · ${g.daysLeft >= 0 ? `${g.daysLeft} days left` : `${-g.daysLeft} days past target`}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
