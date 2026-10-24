"use client";

import { useState } from "react";
import { Icon } from "./Icons";

export function QuickAsk() {
  const [q, setQ] = useState("");
  return (
    <form
      className="quick-ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) window.location.href = `/chat?q=${encodeURIComponent(q.trim())}`;
      }}
    >
      <label htmlFor="quick" className="sr-only">Ask Maverick</label>
      <input id="quick" value={q} onChange={(e) => setQ(e.target.value)} placeholder="What's the one outcome that matters most today?" maxLength={2000} />
      <button className="btn btn-primary" aria-label="Ask" disabled={!q.trim()}>
        <Icon.send width={18} />
      </button>
    </form>
  );
}
