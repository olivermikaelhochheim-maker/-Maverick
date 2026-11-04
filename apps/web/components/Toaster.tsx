"use client";

import { useEffect, useState } from "react";
import type { ToastInput } from "@/lib/toast";

export function Toaster() {
  const [items, setItems] = useState<(ToastInput & { id: number })[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const id = ++n;
      setItems((xs) => [...xs.slice(-2), { ...(e as CustomEvent<ToastInput>).detail, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
    };
    window.addEventListener("mvk:toast", on);
    return () => window.removeEventListener("mvk:toast", on);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast${t.kind === "error" ? " error" : ""}`}>
          <span aria-hidden>{t.kind === "error" ? "⚠" : "✓"}</span>
          <span>{t.text}</span>
          {t.link && <a href={t.link.href}>{t.link.label}</a>}
        </div>
      ))}
    </div>
  );
}
