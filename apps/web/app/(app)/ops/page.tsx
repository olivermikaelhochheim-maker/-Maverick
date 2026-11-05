import Link from "next/link";
import { addDays, computeDashboard, formatEventTime, getSettings } from "@maverick/core";
import { FocusTimer } from "@/components/FocusTimer";
import { QuickAdd } from "@/components/QuickAdd";
import { TaskQuickList } from "@/components/TaskQuickList";
import { Timeline } from "@/components/Timeline";
import { LaunchButton } from "@/components/CommandWidgets";
import { getMaverick, requireUser } from "@/lib/server";

export default async function DailyOps() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const tz = settings.timezone;
  const now = new Date();
  const d = await computeDashboard(m.db, m.cipher, m.deps, user, settings, now);
  const tomorrow = addDays(d.today, 1);
  const [agendaTomorrow, open] = await Promise.all([m.deps.agenda.forDay(user.id, tz, tomorrow), m.deps.planning.listTasks(user.id)]);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < d.today);
  const dueToday = open.filter((t) => t.dueDate === d.today);
  const dueTomorrow = open.filter((t) => t.dueDate === tomorrow);
  const todayList = [...overdue, ...dueToday, ...open.filter((t) => !t.dueDate && t.priority === 1)].slice(0, 12);
  const todayFocus = d.activity.at(-1)?.focusMinutes ?? 0;
  const tomorrowLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${tomorrow}T12:00:00Z`));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">05 · Operations agent</span>
          <h1>Daily Ops</h1>
          <p>Today, tomorrow and the work in between. Calendar is read-only.</p>
        </div>
        <div className="row">
          <LaunchButton template="prepare_tomorrow" label="Prepare me for tomorrow" primary />
          {overdue.length > 0 && <LaunchButton template="clear_overdue" label={`Clear ${overdue.length} overdue`} />}
        </div>
      </div>
      <div className="cards">
        <section className="card span-6" aria-labelledby="h-today">
          <div className="card-head"><h3 id="h-today">Today</h3>{d.agenda.status !== "ok" && <Link className="link" href="/settings#calendar">Connect calendar</Link>}</div>
          <Timeline d={d} tz={tz} now={now} />
        </section>
        <section className="card span-6" aria-labelledby="h-tasks">
          <div className="card-head"><h3 id="h-tasks">To do today</h3><span className="tele">{overdue.length} overdue · {dueToday.length} due</span></div>
          <QuickAdd tz={tz} placeholder="Add a task… e.g. “Call flight school fri 10:00 !1”" />
          {todayList.length ? <TaskQuickList key={todayList.map((t) => t.id).join()} initial={todayList} today={d.today} /> : <p className="empty">Nothing due today.</p>}
        </section>
        <section className="card span-6" aria-labelledby="h-tom">
          <div className="card-head"><h3 id="h-tom">Tomorrow · {tomorrowLabel}</h3></div>
          {agendaTomorrow.status === "ok" ? (
            agendaTomorrow.events.length ? (
              <ul className="agenda">
                {agendaTomorrow.events.map((e) => (
                  <li key={e.id}><span className="time">{formatEventTime(e, tz)}</span><span>{e.title}{e.location ? <span className="faint small"> · {e.location}</span> : null}</span></li>
                ))}
              </ul>
            ) : <p className="empty">No events tomorrow.</p>
          ) : <p className="empty">Calendar not connected, so tomorrow's schedule is unknown.</p>}
          <h3 style={{ marginTop: "1rem" }}>Due tomorrow</h3>
          {dueTomorrow.length ? <ul className="list-plain">{dueTomorrow.map((t) => <li key={t.id} className="item">{t.title}</li>)}</ul> : <p className="empty small">Nothing due tomorrow.</p>}
        </section>
        <section className="card span-6" aria-labelledby="h-focus">
          <div className="card-head"><h3 id="h-focus">Focus</h3><span className="tele">{todayFocus} min today</span></div>
          <FocusTimer key={open.slice(0, 6).map((t) => t.id).join()} tasks={open.slice(0, 6).map((t) => ({ id: t.id, title: t.title }))} todayMinutes={todayFocus} />
        </section>
      </div>
    </div>
  );
}
