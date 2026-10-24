"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export function BriefNow() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (kind: "morning" | "evening" | "weekly") => {
    setBusy(kind);
    setError(null);
    try {
      const res = await api<{ conversationId: string }>("/api/briefings", { body: { kind } });
      window.location.href = `/chat/${res.conversationId}`;
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };
  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="row" style={{ gap: "0.5rem" }}>
        <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => run("morning")}>{busy === "morning" ? "Preparing…" : "Brief me now"}</button>
        <button className="btn btn-sm" disabled={!!busy} onClick={() => run("evening")}>{busy === "evening" ? "Preparing…" : "Evening check-in"}</button>
        <button className="btn btn-sm" disabled={!!busy} onClick={() => run("weekly")}>{busy === "weekly" ? "Preparing…" : "Weekly review"}</button>
      </div>
    </div>
  );
}
