"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { kickLive } from "@/lib/live";

interface Info { host: string; calendarName: string | null; lastOkAt: string | null; lastError: string | null }

/** The setup-free way: paste Google Calendar's private iCal link. */
export function CalendarLinkPanel({ initial }: { initial: Info | null }) {
  const [info, setInfo] = useState(initial);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ link: Info & { eventsToday: number } }>("/api/integrations/calendar-link", { body: { url } });
      setInfo(r.link);
      setUrl("");
      toast(`Calendar connected${r.link.calendarName ? `: ${r.link.calendarName}` : ""}. ${r.link.eventsToday} event${r.link.eventsToday === 1 ? "" : "s"} today.`);
      kickLive();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (info) {
    return (
      <div>
        <p style={{ margin: 0 }}>
          Connected{info.calendarName ? `: ${info.calendarName}` : ""} <span className="badge badge-accent">read-only link</span>
        </p>
        <p className="hint">
          {info.host} · {info.lastError ? <span style={{ color: "var(--warn)" }}>last check failed: {info.lastError}</span> : info.lastOkAt ? `last read ${new Date(info.lastOkAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : "not read yet"} · refreshed every 5 minutes
        </p>
        <button
          className="btn btn-sm btn-danger"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm("Remove the calendar link from Maverick? To make the old link useless everywhere, also press Reset next to the secret address in Google Calendar.")) return;
            await api("/api/integrations/calendar-link", { method: "DELETE" });
            setInfo(null);
            kickLive();
          }}
        >
          Remove link
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="small muted" style={{ marginTop: 0 }}><strong>Easiest (2 minutes, no Google Cloud):</strong> give Maverick your calendar&apos;s private link.</p>
      <ol className="small" style={{ paddingLeft: "1.2rem", margin: "0 0 0.7rem" }}>
        <li>On a computer, open <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer">Google Calendar settings</a>.</li>
        <li>Left side, under <strong>Settings for my calendars</strong>, click your calendar (your name).</li>
        <li>Scroll to <strong>Integrate calendar</strong> → <strong>Secret address in iCal format</strong> → click the copy icon.</li>
        <li>Paste it below and press Connect.</li>
      </ol>
      <form className="row" onSubmit={connect}>
        <input aria-label="Secret calendar address" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: 1, minWidth: 0 }} autoComplete="off" spellCheck={false} />
        <button className="btn btn-primary" disabled={busy || !url.trim()}>{busy ? "Checking…" : "Connect"}</button>
      </form>
      {error && <div className="alert alert-error" style={{ marginTop: "0.6rem" }}>{error}</div>}
      <p className="hint">Read-only. The link lets anyone who has it see your calendar, so Maverick stores it encrypted and never shows it again. Don&apos;t share it elsewhere.</p>
    </div>
  );
}
