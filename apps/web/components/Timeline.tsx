import type { Dashboard } from "@maverick/core";

/** Today's calendar and due tasks on one line, with a "now" marker. */
export function Timeline({ d, tz, now }: { d: Dashboard; tz: string; now: Date }) {
  const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  type Row = { key: string; sort: string; time: string; title: string; sub?: string; kind: "event" | "task"; past: boolean };
  const rows: Row[] = [];
  for (const e of d.agenda.events) {
    rows.push({
      key: e.id,
      sort: e.allDay ? "00:00" : time(e.start),
      time: e.allDay ? "All day" : e.when,
      title: e.title,
      sub: e.location ?? undefined,
      kind: "event",
      past: !e.allDay && Date.parse(e.end) < now.getTime(),
    });
  }
  for (const t of d.dueNow) {
    rows.push({
      key: t.id,
      sort: t.overdue ? "00:00" : t.remindAt ? time(t.remindAt) : "23:59",
      time: t.overdue ? "Overdue" : t.remindAt ? time(t.remindAt) : "Today",
      title: t.title,
      sub: t.priority === 1 ? "High priority" : undefined,
      kind: "task",
      past: false,
    });
  }
  rows.sort((a, b) => a.sort.localeCompare(b.sort));
  const nowHHMM = time(now.toISOString());
  const nowIndex = rows.findIndex((r) => r.sort > nowHHMM);

  const empty =
    d.agenda.status === "ok"
      ? "Nothing scheduled and nothing due. A clear runway."
      : d.agenda.status === "needs_reauth"
        ? "Google sign-in expired; reconnect in Settings."
        : "Calendar not connected, and no tasks due today.";
  if (!rows.length) return <p className="empty">{empty}</p>;

  const nowMarker = (
    <li className="tl-now" aria-label={`Now, ${nowHHMM}`}>
      <span className="tl-dot" />
      <span>Now · {nowHHMM}</span>
    </li>
  );
  return (
    <ol className="timeline">
      {rows.map((r, i) => [
        i === nowIndex ? <li key="now" className="tl-now" aria-label={`Now, ${nowHHMM}`}><span className="tl-dot" /><span>Now · {nowHHMM}</span></li> : null,
        <li key={r.key} className={`tl-item ${r.kind}${r.past ? " past" : ""}`}>
          <span className="tl-dot" aria-hidden />
          <span className="tl-time">{r.time}</span>
          <span>
            {r.title}
            {r.sub && <span className="faint small"> · {r.sub}</span>}
          </span>
        </li>,
      ])}
      {nowIndex === -1 && nowMarker}
    </ol>
  );
}
