import Link from "next/link";
import { computeDashboard, getSettings } from "@maverick/core";
import { ColumnChart } from "@/components/viz";
import { FocusTimer } from "@/components/FocusTimer";
import { GoalProgressList } from "@/components/GoalProgress";
import { Insights } from "@/components/Insights";
import { LiveHero } from "@/components/LiveHero";
import { QuickAdd } from "@/components/QuickAdd";
import { StatTile } from "@/components/StatTile";
import { SuggestionInbox } from "@/components/SuggestionInbox";
import { TaskQuickList } from "@/components/TaskQuickList";
import { Timeline } from "@/components/Timeline";
import { getMaverick, requireUser } from "@/lib/server";

export default async function CommandCenter() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const tz = settings.timezone;
  const now = new Date();
  const [d, tasks, suggestions] = await Promise.all([
    computeDashboard(m.db, m.cipher, m.deps, user, settings, now),
    m.deps.planning.listTasks(user.id, { limit: 6 }),
    m.deps.suggestions.list(user.id, "pending"),
  ]);
  const dateLabel = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now);
  const dates = d.activity.map((a) => a.date);

  const summaryParts: string[] = [];
  if (d.agenda.status === "ok") summaryParts.push(`${d.agenda.events.length} event${d.agenda.events.length === 1 ? "" : "s"}`);
  summaryParts.push(`${d.tasks.dueToday} due today`);
  if (d.tasks.overdue) summaryParts.push(`${d.tasks.overdue} overdue`);
  const todayFocus = d.activity.at(-1)?.focusMinutes ?? 0;

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <LiveHero
        name={user.displayName}
        dateLabel={dateLabel}
        tz={tz}
        wake={settings.schedule.briefingTime}
        sleep={settings.schedule.quietHours.start}
        nextEvent={d.nextEvent}
        summary={summaryParts.join(" · ")}
      />

      {m.providers.mode === "mock" && (
        <div className="alert alert-warn" style={{ marginTop: "1rem" }}>
          <strong>Mock mode.</strong> No AI model is connected, so replies are scripted. Statistics, focus and planning work fully. Add an Anthropic API key to bring Maverick to life.
        </div>
      )}

      <div className="tiles" style={{ margin: "1rem 0" }}>
        <StatTile i={1} icon="✓" label="Tasks done · 7 days" value={d.tasksDone7.value} previous={d.tasksDone7.previous} series={d.tasksDone7.series} dates={dates} unit="tasks" />
        <StatTile i={2} icon="◷" label="Focus time · 7 days" value={d.focus7.value} format="minutes" previous={d.focus7.previous} series={d.focus7.series} dates={dates} unit="min" />
        <StatTile
          i={3}
          icon="🔥"
          label="Streak"
          value={d.streak.current}
          suffix={d.streak.current === 1 ? "day" : "days"}
          sub={`Best ${d.streak.best} · ${d.streak.activeToday ? "today counted ✓" : "do one thing today to extend it"}`}
        />
        <StatTile
          i={4}
          icon="$"
          label="Model spend · this month"
          value={d.spend.monthUsd}
          format="usd"
          sub={`of $${d.spend.hardUsd} · projected $${d.spend.projectedUsd.toFixed(d.spend.projectedUsd < 10 ? 2 : 0)}`}
          series={d.spend.dailyUsd.slice(Math.max(0, d.spend.daysElapsed - 14), d.spend.daysElapsed).map((x) => Number(x.usd.toFixed(4)))}
          dates={d.spend.dailyUsd.slice(Math.max(0, d.spend.daysElapsed - 14), d.spend.daysElapsed).map((x) => x.date)}
          unit="USD"
        />
      </div>

      <div className="cards">
        <section id="focus" className={`card focus-card span-5 reveal`} style={{ ["--i" as string]: 5 }} aria-labelledby="h-focus">
          <div className="card-head">
            <h3 id="h-focus">Focus</h3>
            <span className="small faint">The cure for procrastination is starting</span>
          </div>
          <FocusTimer key={tasks.map((t) => t.id).join()} tasks={tasks.map((t) => ({ id: t.id, title: t.title }))} todayMinutes={todayFocus} />
          <p className="focus-tip">
            {d.tasks.overdue
              ? "Start with the overdue item. Clearing it removes the background guilt that feeds procrastination."
              : "Pick the task you'd most like to avoid. 25 minutes is short enough to start and long enough to matter."}
          </p>
          <div className="focus-stats">
            <div><b>{todayFocus}m</b>today</div>
            <div><b>{Math.round(d.focus7.value / 60 * 10) / 10}h</b>last 7 days</div>
            <div><b>{d.activity.filter((a) => a.focusMinutes > 0).length}</b>focus days / 14</div>
          </div>
        </section>

        <section className="card span-7 reveal" style={{ ["--i" as string]: 6 }} aria-labelledby="h-insights">
          <div className="card-head">
            <h3 id="h-insights">Maverick noticed</h3>
            <span className="small faint">From your tasks, goals, calendar and habits</span>
          </div>
          <Insights items={d.insights} />
        </section>

        <section className="card span-5 reveal" style={{ ["--i" as string]: 7 }} aria-labelledby="h-today">
          <div className="card-head">
            <h3 id="h-today">Today</h3>
            {d.agenda.status !== "ok" && <Link className="link" href="/settings#calendar">Connect calendar</Link>}
          </div>
          <Timeline d={d} tz={tz} now={now} />
        </section>

        <section className="card span-7 reveal" style={{ ["--i" as string]: 8 }} aria-labelledby="h-prio">
          <div className="card-head">
            <h3 id="h-prio">Priorities</h3>
            <Link className="link" href="/planning">All tasks ({d.tasks.open})</Link>
          </div>
          <QuickAdd tz={tz} placeholder="Add a task… e.g. “Statistics revision tomorrow 08:00 !1”" />
          <TaskQuickList key={tasks.map((t) => t.id).join()} initial={tasks.slice(0, 5)} today={d.today} />
        </section>

        <section className="card span-6 reveal" style={{ ["--i" as string]: 9 }} aria-labelledby="h-goals">
          <div className="card-head">
            <h3 id="h-goals">Goals</h3>
            <Link className="link" href="/planning">Manage</Link>
          </div>
          <GoalProgressList goals={d.goals} />
        </section>

        <section className="card span-6 reveal" style={{ ["--i" as string]: 10 }} aria-labelledby="h-activity">
          <div className="card-head">
            <h3 id="h-activity">Tasks completed per day</h3>
            <span className="small faint">Last 14 days</span>
          </div>
          <ColumnChart data={d.activity.map((a) => ({ date: a.date, value: a.tasksDone }))} unit="tasks" height={130} />
          <h3 style={{ marginTop: "1rem" }}>Focus minutes per day</h3>
          <ColumnChart data={d.activity.map((a) => ({ date: a.date, value: a.focusMinutes }))} unit="minutes" height={130} />
        </section>

        <section className="card span-12 reveal" style={{ ["--i" as string]: 11 }} aria-labelledby="h-inbox">
          <div className="card-head">
            <h3 id="h-inbox">Suggestions for you {suggestions.length > 0 && <span className="badge badge-accent">{suggestions.length}</span>}</h3>
            <span className="small faint">Maverick proposes, you decide</span>
          </div>
          <SuggestionInbox initial={suggestions} compact />
        </section>
      </div>

      <p className="phase-note" style={{ marginTop: "1.2rem" }}>
        {d.memories} memor{d.memories === 1 ? "y" : "ies"} · {d.messages7.value} message{d.messages7.value === 1 ? "" : "s"} this week · Maverick can read and suggest, but takes no action outside itself without your approval.
      </p>
    </div>
  );
}
