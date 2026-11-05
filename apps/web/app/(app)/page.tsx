import Link from "next/link";
import { computeDashboard, getSettings, MODE_NAMES } from "@maverick/core";
import { ColumnChart } from "@/components/viz";
import { FocusTimer } from "@/components/FocusTimer";
import { GoalProgressList } from "@/components/GoalProgress";
import { Insights } from "@/components/Insights";
import { QuickAdd } from "@/components/QuickAdd";
import { StatTile } from "@/components/StatTile";
import { SuggestionInbox } from "@/components/SuggestionInbox";
import { TaskQuickList } from "@/components/TaskQuickList";
import { Timeline } from "@/components/Timeline";
import { ActivityFeed, Approvals } from "@/components/IntelPanel";
import { CommandInput, LaunchButton, LiveCore, WidgetBoard } from "@/components/CommandWidgets";
import { StatusTag, StepBar, type UiMission } from "@/components/Missions";
import { BriefNowButton } from "@/components/BriefNowButton";
import { getMaverick, requireUser } from "@/lib/server";

export default async function CommandCenter() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const tz = settings.timezone;
  const now = new Date();
  const [d, tasks, suggestions, missions, autos, status] = await Promise.all([
    computeDashboard(m.db, m.cipher, m.deps, user, settings, now),
    m.deps.planning.listTasks(user.id, { limit: 6 }),
    m.deps.suggestions.list(user.id, "pending"),
    m.agent.list(user.id, { limit: 8 }),
    m.agent.listAutomations(user.id),
    m.agent.status(user.id, now),
  ]);
  const dateLabel = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
  const greeting = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dates = d.activity.map((a) => a.date);
  const todayFocus = d.activity.at(-1)?.focusMinutes ?? 0;
  const ms = JSON.parse(JSON.stringify(missions)) as UiMission[];
  const active = ms.find((x) => ["running", "awaiting_approval", "paused", "proposed"].includes(x.status));
  const lastDone = ms.find((x) => x.status === "completed");

  const summary: string[] = [];
  if (d.agenda.status === "ok") summary.push(`${d.agenda.events.length} event${d.agenda.events.length === 1 ? "" : "s"}`);
  summary.push(`${d.tasks.dueToday} due today`);
  if (d.tasks.overdue) summary.push(`${d.tasks.overdue} overdue`);
  if (d.nextEvent) summary.push(`next: ${d.nextEvent.title}`);

  const widgets = [
    {
      id: "mission",
      label: "Today's mission",
      span: 6,
      alert: status.awaitingApproval > 0,
      node: (
        <>
          <div className="card-head"><h3>Today&apos;s mission</h3><Link className="link" href="/missions">Mission Control</Link></div>
          {active ? (
            <div className="cc-mission">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <Link className="title" href={`/missions/${active.id}`} style={{ color: "var(--text)" }}>{active.title}</Link>
                <StatusTag s={active.status} />
              </div>
              <p className="small muted" style={{ margin: 0 }}>{active.objective}</p>
              <StepBar steps={active.steps} />
            </div>
          ) : (
            <p className="small muted" style={{ marginTop: 0 }}>
              No mission running.{lastDone ? <> Last: <Link href={`/missions/${lastDone.id}`}>{lastDone.title}</Link>.</> : " Launch one and Maverick plans it, runs what your mode allows, and asks for the rest."}
            </p>
          )}
          <div className="cc-quick">
            <LaunchButton template="prepare_tomorrow" label="Prepare me for tomorrow" primary={!active} />
            <LaunchButton template="situation_report" label="Situation report" />
            <LaunchButton template="weekly_review" label="Weekly review" />
          </div>
          {status.awaitingApproval > 0 && <div style={{ marginTop: "0.9rem" }}><Approvals compact /></div>}
        </>
      ),
    },
    {
      id: "priorities",
      label: "Priorities",
      span: 6,
      node: (
        <>
          <div className="card-head"><h3>Priorities</h3><Link className="link" href="/planning">All tasks ({d.tasks.open})</Link></div>
          <QuickAdd tz={tz} placeholder="Add a task… e.g. “Statistics revision tomorrow 08:00 !1”" />
          <TaskQuickList key={tasks.map((t) => t.id).join()} initial={tasks.slice(0, 5)} today={d.today} />
        </>
      ),
    },
    {
      id: "activity",
      label: "Live activity",
      span: 6,
      node: (
        <>
          <div className="card-head"><h3>Live activity</h3><Link className="link" href="/logs">Logs</Link></div>
          <ActivityFeed tz={tz} limit={8} />
        </>
      ),
    },
    {
      id: "upcoming",
      label: "Upcoming",
      span: 6,
      node: (
        <>
          <div className="card-head"><h3>Upcoming · today</h3>{d.agenda.status !== "ok" ? <Link className="link" href="/settings#calendar">Connect calendar</Link> : <Link className="link" href="/ops">Daily Ops</Link>}</div>
          <Timeline d={d} tz={tz} now={now} />
        </>
      ),
    },
    {
      id: "recommendations",
      label: "Recommendations",
      span: 7,
      node: (
        <>
          <div className="card-head"><h3>Recommendations</h3><span className="tele">from your tasks, goals, calendar and habits</span></div>
          <Insights items={d.insights} />
          {suggestions.length > 0 && (
            <>
              <h3 style={{ marginTop: "1rem" }}>Suggestions <span className="badge badge-accent">{suggestions.length}</span></h3>
              <SuggestionInbox initial={suggestions} compact />
            </>
          )}
        </>
      ),
    },
    {
      id: "focus",
      label: "Focus",
      span: 5,
      node: (
        <div id="focus" className="focus-card">
          <div className="card-head"><h3>Focus</h3><span className="tele">{todayFocus} min today</span></div>
          <FocusTimer key={tasks.map((t) => t.id).join()} tasks={tasks.map((t) => ({ id: t.id, title: t.title }))} todayMinutes={todayFocus} />
        </div>
      ),
    },
    {
      id: "stats",
      label: "Performance (7 days)",
      span: 12,
      node: (
        <div className="tiles">
          <StatTile i={1} icon="✓" label="Tasks done · 7 days" value={d.tasksDone7.value} previous={d.tasksDone7.previous} series={d.tasksDone7.series} dates={dates} unit="tasks" />
          <StatTile i={2} icon="◷" label="Focus time · 7 days" value={d.focus7.value} format="minutes" previous={d.focus7.previous} series={d.focus7.series} dates={dates} unit="min" />
          <StatTile i={3} icon="▲" label="Streak" value={d.streak.current} suffix={d.streak.current === 1 ? "day" : "days"} sub={`Best ${d.streak.best} · ${d.streak.activeToday ? "today counted ✓" : "do one thing today to extend it"}`} />
          <StatTile
            i={4}
            icon="$"
            label="Model spend · month"
            value={d.spend.monthUsd}
            format="usd"
            sub={`of $${d.spend.hardUsd} · projected $${d.spend.projectedUsd.toFixed(d.spend.projectedUsd < 10 ? 2 : 0)}`}
            series={d.spend.dailyUsd.slice(Math.max(0, d.spend.daysElapsed - 14), d.spend.daysElapsed).map((x) => Number(x.usd.toFixed(4)))}
            dates={d.spend.dailyUsd.slice(Math.max(0, d.spend.daysElapsed - 14), d.spend.daysElapsed).map((x) => x.date)}
            unit="USD"
          />
        </div>
      ),
    },
    {
      id: "goals",
      label: "Project health",
      span: 6,
      node: (
        <>
          <div className="card-head"><h3>Project health · goals</h3><Link className="link" href="/planning">Manage</Link></div>
          <GoalProgressList goals={d.goals} />
        </>
      ),
    },
    {
      id: "analytics",
      label: "Analytics",
      span: 6,
      node: (
        <>
          <div className="card-head"><h3>Tasks completed per day</h3><span className="tele">14 days</span></div>
          <ColumnChart data={d.activity.map((a) => ({ date: a.date, value: a.tasksDone }))} unit="tasks" height={120} />
          <h3 style={{ marginTop: "1rem" }}>Focus minutes per day</h3>
          <ColumnChart data={d.activity.map((a) => ({ date: a.date, value: a.focusMinutes }))} unit="minutes" height={120} />
        </>
      ),
    },
    {
      id: "workflows",
      label: "Workflows",
      span: 6,
      node: (
        <>
          <div className="card-head"><h3>Workflows</h3><Link className="link" href="/automations">Automations</Link></div>
          {autos.length ? (
            <ul className="list-plain">
              {autos.map((a) => (
                <li key={a.id} className="item kv-row" style={{ justifyContent: "space-between" }}>
                  <span>{a.title}</span>
                  <span className="mono small faint">{a.cadence} {a.time} · {a.enabled ? "on" : "off"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty small">No recurring missions. Schedule “Prepare me for tomorrow” every evening in <Link href="/automations">Automations</Link>.</p>
          )}
        </>
      ),
    },
    {
      id: "telemetry",
      label: "System telemetry",
      span: 6,
      node: (
        <>
          <div className="card-head"><h3>System telemetry</h3><Link className="link" href="/usage">Usage</Link></div>
          <div className="telemetry">
            <div><span className="tele">AI model</span><div className="v">{m.providers.mode === "live" ? "Live" : "Mock"}</div></div>
            <div><span className="tele">Autonomy</span><div className="v">{status.mode} · {MODE_NAMES[status.mode]}</div></div>
            <div><span className="tele">Auto actions</span><div className="v">{status.autoActionsToday}/{status.dailyAutoActions}</div></div>
            <div><span className="tele">Memories</span><div className="v">{d.memories}</div></div>
            <div><span className="tele">Messages · 7d</span><div className="v">{d.messages7.value}</div></div>
            <div><span className="tele">Calendar</span><div className="v">{d.agenda.status === "ok" ? "Connected" : "Off"}</div></div>
          </div>
        </>
      ),
    },
  ];

  return (
    <div className="page">
      <section className="card cc-hero" aria-label="Command deck">
        <div className="left">
          <span className="tele">{dateLabel}</span>
          <h1>{greeting}, {user.displayName}.</h1>
          <p className="muted" style={{ margin: 0 }}>{summary.join(" · ")}</p>
          <CommandInput />
        </div>
        <LiveCore />
        <div className="right">
          <span className="tele">Readiness</span>
          <div style={{ fontSize: "1.6rem", fontFamily: "var(--mono)", margin: "0.2rem 0" }}>{d.tasks.overdue ? `${d.tasks.overdue} overdue` : "Clear"}</div>
          <p className="small muted" style={{ margin: "0 0 0.7rem" }}>{d.tasks.dueToday} due today · {d.tasks.open} open · streak {d.streak.current}d</p>
          <BriefNowButton />
        </div>
      </section>

      {m.providers.mode === "mock" && (
        <div className="alert alert-warn" style={{ marginTop: "1rem" }}>
          <strong>Mock mode.</strong> No AI model is connected: missions, finance, health and planning work fully, reports are assembled from your data, and web research is off. Add an Anthropic API key to bring Maverick fully online.
        </div>
      )}

      <WidgetBoard widgets={widgets} />

      <p className="phase-note" style={{ marginTop: "1.2rem" }}>
        Maverick changes things only inside Maverick, and only as your autonomy mode allows. He cannot send messages, spend money or change your calendar.
      </p>
    </div>
  );
}
