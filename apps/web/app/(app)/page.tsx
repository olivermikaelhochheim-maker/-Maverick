import Link from "next/link";
import { formatEventTime, getSettings, getSpend, localParts } from "@maverick/core";
import { BriefNow } from "@/components/BriefNow";
import { BudgetMeter } from "@/components/BudgetMeter";
import { Orb } from "@/components/Orb";
import { QuickAsk } from "@/components/QuickAsk";
import { SuggestionInbox } from "@/components/SuggestionInbox";
import { TaskQuickList } from "@/components/TaskQuickList";
import { getMaverick, requireUser } from "@/lib/server";

function greeting(hour: number): string {
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const KIND_LABEL = { morning: "Morning briefing", evening: "Evening check-in", weekly: "Weekly review" } as const;

export default async function CommandCenter() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const tz = settings.timezone;
  const local = localParts(tz);
  const [spend, tasks, goals, suggestions, agenda, briefings] = await Promise.all([
    getSpend(m.db, user.id, settings),
    m.deps.planning.listTasks(user.id, { limit: 5 }),
    m.deps.planning.listGoals(user.id, { activeOnly: true }),
    m.deps.suggestions.list(user.id, "pending"),
    m.deps.agenda.forDay(user.id, tz, local.date),
    m.briefings.latest(user.id, 3),
  ]);
  const today = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const todaysBriefing = briefings.find((b) => b.kind === "morning" && b.localDate === local.date);

  return (
    <div className="page">
      <section className="hero">
        <Orb size={84} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="muted" style={{ margin: 0 }}>{today}</p>
          <h1>{greeting(Math.floor(local.minutes / 60))}, {user.displayName}.</h1>
          <QuickAsk />
        </div>
      </section>

      {m.providers.mode === "mock" && (
        <div className="alert alert-warn">
          <strong>Mock mode.</strong> No AI model is connected, so replies are scripted and briefings are built from your data without AI. Add an Anthropic API key (README, step 3) and restart.
        </div>
      )}

      <div className="cards">
        <section className="card span-8" aria-labelledby="h-brief">
          <h3 id="h-brief">Briefing</h3>
          {todaysBriefing?.conversationId ? (
            <p>
              Today&apos;s briefing is ready. <Link href={`/chat/${todaysBriefing.conversationId}`}>Read it and reply</Link>.
            </p>
          ) : (
            <p className="muted small">
              {settings.proactive.morningBriefing
                ? `Your next morning briefing arrives at ${settings.schedule.briefingTime} (Maverick must be running on the Mac).`
                : "Scheduled briefings are off. Turn them on in Settings."}
            </p>
          )}
          <BriefNow />
          {briefings.length > 0 && (
            <p className="hint" style={{ marginTop: "0.6rem" }}>
              Recent:{" "}
              {briefings.map((b, i) => (
                <span key={`${b.kind}-${b.createdAt}`}>
                  {i > 0 && " · "}
                  {b.conversationId ? <Link href={`/chat/${b.conversationId}`}>{KIND_LABEL[b.kind]} {b.localDate.slice(5)}</Link> : KIND_LABEL[b.kind]}
                </span>
              ))}
            </p>
          )}
        </section>

        <section className="card span-4" aria-labelledby="h-budget">
          <h3 id="h-budget">Model spend this month</h3>
          <BudgetMeter spend={spend} />
          <p className="small" style={{ marginTop: "0.6rem", marginBottom: 0 }}><Link href="/usage">Details</Link> · <Link href="/settings">Limits</Link></p>
        </section>

        <section className="card span-6" aria-labelledby="h-agenda">
          <h3 id="h-agenda">Today&apos;s agenda</h3>
          {agenda.status === "ok" ? (
            agenda.events.length ? (
              <ul className="agenda">
                {agenda.events.map((e) => (
                  <li key={e.id}>
                    <span className="time">{formatEventTime(e, tz)}</span>
                    <span>{e.title}{e.location && <span className="faint small"> · {e.location}</span>}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Nothing scheduled today.</p>
            )
          ) : agenda.status === "needs_reauth" ? (
            <p className="small" style={{ color: "var(--warn)" }}>Google sign-in expired. <Link href="/settings#calendar">Reconnect</Link>.</p>
          ) : agenda.status === "error" ? (
            <p className="empty">Couldn&apos;t read the calendar just now.</p>
          ) : (
            <p className="empty">Calendar not connected. <Link href="/settings#calendar">Connect Google Calendar</Link> (read-only).</p>
          )}
        </section>

        <section className="card span-6" aria-labelledby="h-prio">
          <h3 id="h-prio">Top priorities</h3>
          <TaskQuickList initial={tasks} today={local.date} />
          <p className="small" style={{ marginBottom: 0 }}><Link href="/planning">All goals &amp; tasks</Link></p>
        </section>

        <section className="card span-8" aria-labelledby="h-inbox">
          <h3 id="h-inbox">Suggestions for you {suggestions.length > 0 && <span className="badge badge-accent">{suggestions.length}</span>}</h3>
          <SuggestionInbox initial={suggestions} compact />
        </section>

        <section className="card span-4" aria-labelledby="h-goals">
          <h3 id="h-goals">Goals in play</h3>
          {goals.length ? (
            <ul className="list-plain">
              {goals.slice(0, 5).map((g) => (
                <li key={g.id}><span className="item">{g.title}{g.metric && <span className="faint small"> · {g.metric}</span>}</span></li>
              ))}
            </ul>
          ) : (
            <p className="empty">None yet. <Link href="/planning">Add your first goal</Link>.</p>
          )}
        </section>

        <section className="card span-12" aria-labelledby="h-approvals">
          <h3 id="h-approvals">External actions</h3>
          <p className="empty">None pending.</p>
          <p className="phase-note">
            Maverick can read your calendar and make suggestions, but it can&apos;t send, book, buy, post or change anything outside itself. When those abilities
            come, each action will wait here for your confirmation.
          </p>
        </section>
      </div>
    </div>
  );
}
