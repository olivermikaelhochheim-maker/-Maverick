"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";

export function BriefNowButton({ kind = "morning", label = "☀ Brief me" }: { kind?: "morning" | "evening" | "weekly"; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ conversationId: string }>("/api/briefings", { body: { kind } });
          window.location.href = `/chat/${r.conversationId}`;
        } catch (err) {
          toast({ text: (err as Error).message, kind: "error" });
          setBusy(false);
        }
      }}
    >
      {busy ? "Preparing…" : label}
    </button>
  );
}
