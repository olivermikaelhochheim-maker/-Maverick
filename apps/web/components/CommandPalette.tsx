"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseQuickTask } from "@maverick/core/quickadd";
import { matchIntent, TEMPLATES } from "@maverick/core/intent";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";

interface Item {
  id: string;
  group: "Missions" | "Do" | "Go to" | "Conversations";
  icon: string;
  label: string;
  hint?: string;
  /** Extra line under the label, e.g. what a task line was understood as */
  sub?: string;
  run: () => void | Promise<void>;
}

const PAGES: [string, string, string][] = [
  ["Command Center", "/", "⌂"],
  ["Intelligence (conversation)", "/chat", "◇"],
  ["Mission Control", "/missions", "◎"],
  ["Agent Operations", "/agents", "▣"],
  ["Daily Ops", "/ops", "▤"],
  ["Projects & Goals", "/planning", "☑"],
  ["Finance", "/finance", "kr"],
  ["Health & Performance", "/health", "♥"],
  ["Communications", "/comms", "✉"],
  ["Research", "/research", "⌕"],
  ["Automations", "/automations", "↻"],
  ["Logs", "/logs", "≡"],
  ["Permissions & autonomy", "/permissions", "⚖"],
  ["Task library", "/library", "≣"],
  ["Memory Vault", "/memory", "◉"],
  ["Files", "/files", "▢"],
  ["Usage & budget", "/usage", "$"],
  ["Security & audit log", "/security", "⛨"],
  ["Settings", "/settings", "⚙"],
  ["Voice settings", "/settings#voice", "♪"],
  ["Google Calendar", "/settings#calendar", "▦"],
];

async function launchMission(template: string, params: Record<string, string> = {}) {
  try {
    const r = await api<{ mission: { id: string; title: string } }>("/api/missions", { body: { template, params } });
    toast({ text: `Mission launched: ${r.mission.title}`, link: { label: "Open", href: `/missions/${r.mission.id}` } });
    window.dispatchEvent(new Event("mvk:refresh"));
    window.location.href = `/missions/${r.mission.id}`;
  } catch (err) {
    toast({ text: (err as Error).message, kind: "error" });
  }
}

/** Open with ⌘K / Ctrl+K, or by dispatching "mvk:palette". */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [convs, setConvs] = useState<{ id: string; title: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mvk:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mvk:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    setTimeout(() => inputRef.current?.focus(), 10);
    api<{ conversations: { id: string; title: string }[] }>("/api/conversations").then((d) => setConvs(d.conversations.slice(0, 30)), () => {});
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const go = (href: string) => {
    close();
    window.location.href = href;
  };

  const items = useMemo<Item[]>(() => {
    const text = q.trim();
    const lower = text.toLowerCase();
    const out: Item[] = [];
    if (text) {
      // A mission command ("prepare me for tomorrow", "research …") comes first.
      const intent = matchIntent(text);
      if (intent) {
        const t = TEMPLATES.find((x) => x.id === intent.template);
        out.push({ id: "mission", group: "Missions", icon: "◎", label: `Launch mission: ${t?.label ?? intent.template}`, sub: intent.params.question ? `“${intent.params.question}”` : undefined, run: () => { close(); void launchMission(intent.template, intent.params); } });
      }
      // If the line reads like a task (a day, time, !priority or #goal), offer that first.
      const parsed = parseQuickTask(text, Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Oslo");
      const looksLikeTask = parsed.understood.length > 0;
      const ask: Item = { id: "ask", group: "Do", icon: "✦", label: `Ask Maverick: “${text}”`, run: () => go(`/chat?q=${encodeURIComponent(text)}`) };
      if (!looksLikeTask) out.push(ask);
      out.push({
        id: "task",
        group: "Do",
        icon: "＋",
        label: `Add task: “${looksLikeTask ? parsed.title : text}”`,
        sub: looksLikeTask ? parsed.understood.join(" · ") : undefined,
        run: async () => {
          close();
          try {
            const r = await api<{ task: { title: string }; understood: string[] }>("/api/tasks/quick", { body: { text } });
            toast({ text: `Task added: ${r.task.title}${r.understood.length ? ` · ${r.understood.join(" · ")}` : ""}`, link: { label: "View", href: "/planning" } });
          } catch (err) {
            toast({ text: (err as Error).message, kind: "error" });
          }
        },
      });
      if (looksLikeTask) out.push(ask);
      out.push({
        id: "remember",
        group: "Do",
        icon: "◎",
        label: `Remember: “${text}”`,
        run: async () => {
          close();
          try {
            await api("/api/memories", { body: { content: text, category: "profile" } });
            toast({ text: "Saved to your Memory Vault.", link: { label: "View", href: "/memory" } });
          } catch (err) {
            toast({ text: (err as Error).message, kind: "error" });
          }
        },
      });
    }
    const actions: Item[] = [
      { id: "new", group: "Do", icon: "💬", label: "New conversation", run: () => go("/chat") },
      {
        id: "focus",
        group: "Do",
        icon: "◷",
        label: "Start a 25-minute focus session",
        run: async () => {
          close();
          try {
            await api("/api/focus", { body: { action: "start", minutes: 25 } });
            window.dispatchEvent(new Event("mvk:focus-changed"));
            toast({ text: "Focus started: 25 minutes. Phone face down.", link: { label: "Timer", href: "/#focus" } });
          } catch (err) {
            toast({ text: (err as Error).message, kind: "error" });
          }
        },
      },
      {
        id: "brief",
        group: "Do",
        icon: "☀",
        label: "Brief me now",
        run: async () => {
          close();
          toast("Preparing your briefing…");
          const r = await api<{ conversationId: string }>("/api/briefings", { body: { kind: "morning" } });
          window.location.href = `/chat/${r.conversationId}`;
        },
      },
    ];
    out.push(...actions.filter((a) => !lower || a.label.toLowerCase().includes(lower)));
    for (const t of TEMPLATES.filter((x) => x.params.every((p) => !p.required))) {
      const label = `Mission: ${t.label}`;
      if (!lower || label.toLowerCase().includes(lower)) out.push({ id: `m-${t.id}`, group: "Missions", icon: "◎", label, run: () => { close(); void launchMission(t.id); } });
    }
    for (const [label, href, icon] of PAGES) {
      if (!lower || label.toLowerCase().includes(lower)) out.push({ id: `go-${href}`, group: "Go to", icon, label, run: () => go(href) });
    }
    if (lower) {
      for (const c of convs.filter((c) => c.title.toLowerCase().includes(lower)).slice(0, 6)) {
        out.push({ id: `c-${c.id}`, group: "Conversations", icon: "↳", label: c.title, run: () => go(`/chat/${c.id}`) });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, convs]);

  useEffect(() => setSel(0), [q]);

  if (!open) return null;

  let lastGroup = "";
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask, add a task, remember something, or jump to…"
          aria-label="Command"
          aria-controls="palette-list"
          aria-activedescendant={items[sel] ? `pi-${items[sel]!.id}` : undefined}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(items.length - 1, s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter" && items[sel]) {
              e.preventDefault();
              void items[sel]!.run();
            }
          }}
        />
        <ul id="palette-list" role="listbox">
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <li key={`g-${it.group}`} className="p-group" role="presentation">{it.group}</li> : null;
            lastGroup = it.group;
            return [
              header,
              <li key={it.id} role="presentation">
                <button id={`pi-${it.id}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => void it.run()}>
                  <span className="p-ico" aria-hidden>{it.icon}</span>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.label}
                    {it.sub && <span className="p-sub">{it.sub}</span>}
                  </span>
                  {i === sel && <span className="p-hint">Enter</span>}
                </button>
              </li>,
            ];
          })}
          {items.length === 0 && <li className="p-group">Nothing matches</li>}
        </ul>
        <div className="palette-foot">
          <span><span className="kbd">↑↓</span> move</span>
          <span><span className="kbd">Enter</span> run</span>
          <span><span className="kbd">Esc</span> close</span>
        </div>
      </div>
    </div>
  );
}
