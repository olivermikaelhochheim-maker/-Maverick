import Link from "next/link";
import { getSettings, getSpend } from "@maverick/core";
import { BudgetMeter } from "@/components/BudgetMeter";
import { Orb } from "@/components/Orb";
import { QuickAsk } from "@/components/QuickAsk";
import { getMaverick, requireUser } from "@/lib/server";

function greeting(tz: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date()));
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function CommandCenter() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const spend = await getSpend(m.db, user.id, settings);
  const recent = (await m.chat.conversations.list(user.id, 5));
  const today = new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="page">
      <section className="hero">
        <Orb size={84} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="muted" style={{ margin: 0 }}>{today}</p>
          <h1>{greeting(settings.timezone)}, {user.displayName}.</h1>
          <QuickAsk />
        </div>
      </section>

      {m.providers.mode === "mock" && (
        <div className="alert alert-warn">
          <strong>Mock mode.</strong> No AI model is connected, so replies are scripted and free. Add an Anthropic API key (see the README, step 3) and restart to talk to the real Maverick.
        </div>
      )}

      <div className="cards">
        <section className="card span-8" aria-labelledby="h-priorities">
          <h3 id="h-priorities">Today&apos;s priorities</h3>
          <p className="empty">Not tracked yet.</p>
          <p className="phase-note">Goals, daily planning and the morning briefing arrive in Phase 3. For now, <Link href="/chat?q=Help%20me%20plan%20today.%20Ask%20me%20what%20outcome%20matters%20most.">ask Maverick to plan today with you</Link>.</p>
        </section>

        <section className="card span-4" aria-labelledby="h-budget">
          <h3 id="h-budget">Model spend this month</h3>
          <BudgetMeter spend={spend} />
          <p className="small" style={{ marginTop: "0.6rem", marginBottom: 0 }}><Link href="/usage">Details</Link> · <Link href="/settings">Limits</Link></p>
        </section>

        <section className="card span-6" aria-labelledby="h-recent">
          <h3 id="h-recent">Recent conversations</h3>
          {recent.length === 0 ? (
            <p className="empty">None yet. <Link href="/chat">Start one</Link>.</p>
          ) : (
            <ul className="list-plain">
              {recent.map((c) => (
                <li key={c.id}><Link href={`/chat/${c.id}`}>{c.title}</Link></li>
              ))}
            </ul>
          )}
        </section>

        <section className="card span-6" aria-labelledby="h-approvals">
          <h3 id="h-approvals">Pending approvals</h3>
          <p className="empty">None.</p>
          <p className="phase-note">Maverick can&apos;t take any external action in this version: no email, calendar, purchases or posts. When integrations arrive (Phase 4), every external action will wait here for your confirmation.</p>
        </section>

        <section className="card span-12" aria-labelledby="h-status">
          <h3 id="h-status">System status</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><td>AI model</td><td>{m.providers.mode === "live" ? <span className="badge badge-accent">Connected · Anthropic Claude</span> : <span className="badge badge-warn">Mock (offline)</span>}</td></tr>
                <tr><td>Database</td><td><span className="badge">{m.db.kind === "pglite" ? "Embedded on this Mac" : "PostgreSQL server"}</span></td></tr>
                <tr><td>Voice</td><td><span className="badge">Not yet: Phase 2</span></td></tr>
                <tr><td>Calendar, email, tasks</td><td><span className="badge">Not connected: Phase 4</span></td></tr>
                <tr><td>Agenda</td><td><span className="badge">Needs calendar: Phase 4</span></td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
