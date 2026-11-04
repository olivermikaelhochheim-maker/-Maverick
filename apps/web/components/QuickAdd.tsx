"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseQuickTask } from "@maverick/core/quickadd";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";

/** One line → a task. Shows what Maverick understood as you type. */
export function QuickAdd({ tz, onAdded, placeholder }: { tz: string; onAdded?: () => void; placeholder?: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const parsed = useMemo(() => (text.trim() ? parseQuickTask(text, tz) : null), [text, tz]);
  return (
    <form
      className="qa"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        try {
          const r = await api<{ task: { title: string }; understood: string[]; goalMatched: boolean }>("/api/tasks/quick", { body: { text } });
          const notes = r.understood.filter((u) => !u.startsWith("Goal") || r.goalMatched);
          toast(`Added “${r.task.title}”${notes.length ? ` · ${notes.join(" · ")}` : ""}`);
          setText("");
          // Soft refresh: server data updates in place and the confirmation stays visible.
          if (onAdded) onAdded();
          else router.refresh();
        } catch (err) {
          toast({ text: (err as Error).message, kind: "error" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="qa-field">
      <span className="qa-ico" aria-hidden>＋</span>
      <label htmlFor="quick-add" className="sr-only">Quick add a task</label>
      <input
        id="quick-add"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? "Add a task: “Call flight school tomorrow 15:00 !1 #pilot”"}
        maxLength={300}
        autoComplete="off"
        disabled={busy}
      />
      </div>
      <div className="qa-chips" aria-live="polite">
        {parsed?.understood.map((u) => <span key={u} className="qa-chip">{u}</span>)}
        {parsed && !parsed.understood.length && (
          <span className="hint" style={{ margin: 0 }}>Tip: add a day (“friday”, “20.11”), a time (“15:00”), !1 for high priority, #goal</span>
        )}
      </div>
    </form>
  );
}
