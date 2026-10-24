"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, usd } from "@/lib/client";
import { Icon } from "./Icons";
import { Markdown } from "./Markdown";
import { Orb } from "./Orb";

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "partial" | "error" | "streaming";
  model?: string | null;
  routeReason?: string | null;
  costUsd?: number | null;
  latencyMs?: number | null;
  firstTokenMs?: number;
}

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

type StreamEvent =
  | { type: "meta"; conversationId: string; model: string; tier: string; routeReason: string; mode: string; warnings: string[] }
  | { type: "delta"; text: string }
  | { type: "done"; assistantMessageId: string; costUsd: number; latencyMs: number; spend: { monthUsd: number; monthHardUsd: number } }
  | { type: "error"; code: string; message: string; spend?: { monthUsd: number; monthHardUsd: number } };

const SUGGESTIONS = [
  "Help me plan the most important outcome for today",
  "I keep procrastinating on a big task. Where do I start?",
  "What baseline numbers do you need to plan Zorza's growth?",
];

const MODEL_LABEL: Record<string, string> = {
  "claude-haiku-5-5": "Haiku 5.5",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-opus-5-5": "Opus 5.5",
  "mock-maverick": "Mock",
};

export function ChatView(props: {
  conversations: ConversationSummary[];
  conversationId?: string;
  initialMessages: UiMessage[];
  initialQuery?: string;
  mode: "live" | "mock";
}) {
  const [conversations, setConversations] = useState(props.conversations);
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [messages, setMessages] = useState<UiMessage[]>(props.initialMessages);
  const [input, setInput] = useState("");
  const [deep, setDeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [spend, setSpend] = useState<{ monthUsd: number; monthHardUsd: number } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sentInitial = useRef(false);

  const title = conversations.find((c) => c.id === conversationId)?.title ?? "New conversation";

  // Keep the newest message in view while streaming, unless Oliver has scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom || busy) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const refreshList = useCallback(async () => {
    try {
      const data = await api<{ conversations: ConversationSummary[] }>("/api/conversations");
      setConversations(data.conversations);
    } catch {
      /* non-critical */
    }
  }, []);

  const patchAssistant = (id: string, patch: Partial<UiMessage> | ((m: UiMessage) => Partial<UiMessage>)) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)));

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput("");
      setWarnings([]);
      setBusy(true);
      const userId = `u-${Date.now()}`;
      const asstId = `a-${Date.now()}`;
      setMessages((ms) => [...ms, { id: userId, role: "user", content: text, status: "complete" }, { id: asstId, role: "assistant", content: "", status: "streaming" }]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const started = performance.now();
      let gotFirst = false;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, conversationId, deep }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 401) window.location.href = "/login";
          throw new Error(data.error ?? `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line) as StreamEvent;
            if (ev.type === "meta") {
              if (!conversationId) {
                setConversationId(ev.conversationId);
                window.history.replaceState(null, "", `/chat/${ev.conversationId}`);
              }
              setWarnings(ev.warnings);
              patchAssistant(asstId, { model: ev.model, routeReason: ev.routeReason });
            } else if (ev.type === "delta") {
              if (!gotFirst) {
                gotFirst = true;
                patchAssistant(asstId, { firstTokenMs: Math.round(performance.now() - started) });
              }
              patchAssistant(asstId, (m) => ({ content: m.content + ev.text }));
            } else if (ev.type === "done") {
              patchAssistant(asstId, { status: "complete", id: ev.assistantMessageId, costUsd: ev.costUsd, latencyMs: ev.latencyMs });
              setSpend(ev.spend);
            } else if (ev.type === "error") {
              patchAssistant(asstId, (m) => ({ status: m.content ? "partial" : "error", content: m.content || ev.message }));
              if (ev.code !== "aborted") setWarnings((w) => [...w, ev.message]);
              if (ev.spend) setSpend(ev.spend);
            }
          }
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        patchAssistant(asstId, (m) => ({
          status: m.content ? "partial" : "error",
          content: m.content || (aborted ? "Stopped." : (err as Error).message || "Connection lost."),
        }));
      } finally {
        // Anything still marked streaming at this point was cut off.
        patchAssistant(asstId, (m) => (m.status === "streaming" ? { status: m.content ? "partial" : "error", content: m.content || "No reply received." } : {}));
        setBusy(false);
        abortRef.current = null;
        void refreshList();
        inputRef.current?.focus();
      }
    },
    [busy, conversationId, deep, refreshList],
  );

  // Command Center quick-ask: /chat?q=...
  useEffect(() => {
    if (props.initialQuery && !sentInitial.current) {
      sentInitial.current = true;
      window.history.replaceState(null, "", "/chat");
      void send(props.initialQuery);
    }
  }, [props.initialQuery, send]);

  const stop = () => abortRef.current?.abort();

  const rename = async () => {
    if (!conversationId) return;
    const next = window.prompt("Rename conversation", title);
    if (!next?.trim()) return;
    await api(`/api/conversations/${conversationId}`, { method: "PATCH", body: { title: next } });
    void refreshList();
  };

  const remove = async () => {
    if (!conversationId) return;
    if (!window.confirm("Delete this conversation permanently? This can't be undone.")) return;
    await api(`/api/conversations/${conversationId}`, { method: "DELETE" });
    window.location.href = "/chat";
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
    if (e.key === "Escape" && busy) stop();
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const orbState = busy ? (lastAssistant?.content ? "speaking" : "thinking") : "idle";

  return (
    <div className="chat">
      <aside className={`chat-list${listOpen ? " open" : ""}`} aria-label="Conversations">
        {listOpen && (
          <button className="btn btn-sm chat-list-close mobile-only" onClick={() => setListOpen(false)} aria-label="Close conversation list">
            <Icon.x width={16} /> Close
          </button>
        )}
        <a href="/chat" className="btn btn-sm" style={{ width: "100%", marginBottom: "0.8rem", color: "var(--text)" }}>
          <Icon.plus width={16} /> New conversation
        </a>
        {conversations.length === 0 && <p className="empty" style={{ padding: "0 0.7rem" }}>No conversations yet.</p>}
        {conversations.map((c) => (
          <Link key={c.id} href={`/chat/${c.id}`} aria-current={c.id === conversationId ? "page" : undefined} onClick={() => setListOpen(false)}>
            {c.title}
          </Link>
        ))}
      </aside>

      <section className="chat-main" aria-label="Conversation">
        <header className="chat-top">
          <button className="btn btn-ghost btn-sm mobile-only" onClick={() => setListOpen(true)} aria-label="Show conversations">
            <Icon.list width={18} />
          </button>
          <Orb size={30} state={orbState} />
          <div className="title">{title}</div>
          {props.mode === "mock" && <span className="badge badge-warn">Mock mode</span>}
          {conversationId && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={rename}>Rename</button>
              <button className="btn btn-ghost btn-sm" onClick={remove}>Delete</button>
            </>
          )}
        </header>

        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-inner" aria-live="polite" aria-busy={busy}>
            {messages.length === 0 && (
              <div className="chat-empty">
                <Orb size={88} />
                <h2>How can I help, Oliver?</h2>
                <p className="small">Text only for now. Voice arrives in Phase 2.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="btn btn-sm" onClick={() => void send(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="msg msg-user">{m.content}</div>
              ) : (
                <article key={m.id} className={`msg msg-assistant${m.status === "error" ? " msg-error" : ""}`}>
                  <div className="who">MAVERICK</div>
                  <div className={`body${m.status === "streaming" ? " cursor" : ""}`}>
                    {m.content ? <Markdown text={m.content} /> : m.status === "streaming" ? <span className="faint">Thinking…</span> : null}
                  </div>
                  {m.status !== "streaming" && (
                    <div className="msg-meta">
                      {m.model && <span title={m.routeReason ?? undefined}>{MODEL_LABEL[m.model] ?? m.model}</span>}
                      {m.routeReason && <span>{m.routeReason}</span>}
                      {typeof m.costUsd === "number" && <span>{usd(m.costUsd, 4)}</span>}
                      {m.firstTokenMs !== undefined && <span>first word {(m.firstTokenMs / 1000).toFixed(1)}s</span>}
                      {m.status === "partial" && <span className="badge badge-warn">incomplete</span>}
                    </div>
                  )}
                </article>
              ),
            )}
          </div>
        </div>

        <div className="composer">
          <div className="composer-inner">
            {warnings.map((w, i) => (
              <div key={i} className="alert alert-warn" role="status">{w}</div>
            ))}
            <form
              className="composer-box"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <label htmlFor="composer" className="sr-only">Message Maverick</label>
              <textarea
                id="composer"
                ref={inputRef}
                rows={1}
                value={input}
                placeholder="Message Maverick…"
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 320)}px`;
                }}
                onKeyDown={onKeyDown}
                maxLength={20000}
                autoFocus
              />
              {busy ? (
                <button type="button" className="btn" onClick={stop} aria-label="Stop generating">
                  <Icon.stop width={18} />
                </button>
              ) : (
                <button type="submit" className="btn btn-primary" disabled={!input.trim()} aria-label="Send">
                  <Icon.send width={18} />
                </button>
              )}
            </form>
            <div className="composer-tools">
              <label className="toggle" title="Use the strongest model for this message (costs more)">
                <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> Think deeper
              </label>
              <span>
                {spend ? `${usd(spend.monthUsd)} of ${usd(spend.monthHardUsd)} this month · ` : ""}Enter to send · Shift+Enter for a new line
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
