"use client";

import { useState } from "react";
import type { SessionInfo } from "@maverick/core";
import { api } from "@/lib/client";

function device(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Browser";
}

export function SessionsPanel({ initial }: { initial: SessionInfo[] }) {
  const [sessions, setSessions] = useState(initial);
  const reload = async () => setSessions((await api<{ sessions: SessionInfo[] }>("/api/sessions")).sessions);

  return (
    <>
      <ul className="list-plain">
        {sessions.map((s) => (
          <li key={s.id}>
            <div className="item row" style={{ justifyContent: "space-between" }}>
              <span>
                {device(s.userAgent)} {s.current && <span className="badge badge-accent">this device</span>}
                <br />
                <span className="faint small">Last active {new Date(s.lastSeenAt).toLocaleString()}</span>
              </span>
              {!s.current && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={async () => {
                    await api(`/api/sessions/${s.id}`, { method: "DELETE" });
                    await reload();
                  }}
                >
                  Sign out
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {sessions.length > 1 && (
        <button
          className="btn btn-sm btn-danger"
          style={{ marginTop: "0.8rem" }}
          onClick={async () => {
            if (!window.confirm("Sign out every other device?")) return;
            await api("/api/sessions", { method: "DELETE" });
            await reload();
          }}
        >
          Sign out all other devices
        </button>
      )}
    </>
  );
}
