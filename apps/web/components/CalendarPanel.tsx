"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export function CalendarPanel(props: {
  mode: "google" | "mock" | "none";
  connected: { email: string | null; status: "active" | "needs_reauth"; scopes: string[] } | null;
  flash?: string;
  /** What Maverick is configured with, to compare against Google Cloud Console. */
  setup?: { clientId: string; redirectUri: string; problem: string | null } | null;
}) {
  const [connected, setConnected] = useState(props.connected);
  const flash: Record<string, { kind: string; text: string }> = {
    connected: { kind: "alert-ok", text: "Google Calendar connected (read-only)." },
    denied: { kind: "alert-warn", text: "You cancelled on Google's screen. Nothing was connected." },
    invalid: { kind: "alert-error", text: "That sign-in link expired or didn't match. Try again." },
    failed: { kind: "alert-error", text: "Google refused the connection. Check the setup steps in the README and try again." },
    not_configured: { kind: "alert-warn", text: "Google isn't set up yet. See README → Connect Google Calendar." },
    bad_credentials: { kind: "alert-error", text: "The Google credentials Maverick has look wrong, so it didn't send you to Google. See the details below." },
  };
  const f = props.flash ? flash[props.flash] : undefined;

  const details = props.setup && (
    <details className="small muted" style={{ marginTop: "0.8rem" }} open={Boolean(props.setup.problem) || props.flash === "failed"}>
      <summary style={{ cursor: "pointer" }}>Setup details (compare with Google Cloud Console)</summary>
      {props.setup.problem && <p style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{props.setup.problem}</p>}
      <p style={{ marginTop: "0.5rem", marginBottom: "0.3rem" }}>
        Client ID in use: <code>{props.setup.clientId}</code>
      </p>
      <p style={{ margin: 0 }}>
        Redirect URI Google must allow: <code style={{ wordBreak: "break-all" }}>{props.setup.redirectUri}</code>
      </p>
      <p className="hint">
        If Google says &quot;OAuth client was not found&quot; (invalid_client): the Client ID above must exactly match one listed under APIs &amp; Services → Credentials, in the same
        Google Cloud project. A newly created client can take a few minutes to start working.
      </p>
    </details>
  );

  if (props.mode === "mock") return <p className="muted small">Demo calendar in use (MAVERICK_CALENDAR_PROVIDER=mock).</p>;

  return (
    <div>
      {f && <div className={`alert ${f.kind}`}>{f.text}</div>}
      {details}
      {props.mode === "none" ? (
        <p className="muted small">
          Not set up. Connecting needs a one-time Google Cloud setup (about 20 minutes): see <strong>README → Connect Google Calendar</strong>, then run{" "}
          <code>pnpm configure</code> and restart.
        </p>
      ) : connected ? (
        <div>
          <p style={{ margin: 0 }}>
            Connected{connected.email ? ` as ${connected.email}` : ""}{" "}
            {connected.status === "needs_reauth" ? <span className="badge badge-warn">needs reconnecting</span> : <span className="badge badge-accent">read-only</span>}
          </p>
          <p className="hint">Permission: read your calendars. Maverick can&apos;t create, change or delete events.</p>
          <div className="row" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
            {connected.status === "needs_reauth" && <a className="btn btn-sm btn-primary" href="/api/integrations/google/start">Reconnect</a>}
            <button
              className="btn btn-sm btn-danger"
              onClick={async () => {
                if (!window.confirm("Disconnect Google Calendar? Maverick's access is revoked at Google too.")) return;
                await api("/api/integrations/google", { method: "DELETE" });
                setConnected(null);
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="muted small">Lets the briefing and conversations see today&apos;s events. Read-only: Maverick can&apos;t change your calendar.</p>
          <a className="btn btn-sm btn-primary" href="/api/integrations/google/start">Connect Google Calendar</a>
          <p className="hint">Do this from the Mac (at http://localhost:3000); Google sends you back there afterwards.</p>
        </div>
      )}
    </div>
  );
}
