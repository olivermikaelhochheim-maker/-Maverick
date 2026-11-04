"use client";

import { useState } from "react";

/** Settings: restore an export from another Maverick (e.g. Mac → cloud). */
export function ImportPanel() {
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <p className="muted small">
        Moving from another Maverick? On the old one, use <strong>Export all data</strong>, then choose that file here. Works only on a fresh Maverick, so nothing gets duplicated.
      </p>
      <label className="btn btn-sm" style={{ cursor: busy ? "wait" : "pointer" }}>
        {busy ? "Importing…" : "Choose export file…"}
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setStatus(null);
            try {
              const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Import failed.");
              const c = data.imported as Record<string, number>;
              const life = c.habits !== undefined ? ` Life: ${c.habits} habits, ${c.habitLogs} habit logs and ${c.journal} journal entries.` : "";
              setStatus({ kind: "ok", text: `Imported ${c.memories} memories, ${c.goals} goals, ${c.tasks} tasks and ${c.conversations} conversations.${life}` });
            } catch (err) {
              setStatus({ kind: "error", text: (err as Error).message });
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {status && <div className={`alert ${status.kind === "ok" ? "alert-ok" : "alert-error"}`} role="status" style={{ marginTop: "0.8rem" }}>{status.text}</div>}
    </div>
  );
}
