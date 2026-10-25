"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, usd } from "@/lib/client";
import { Icon } from "./Icons";
import { Markdown } from "./Markdown";
import { Orb } from "./Orb";
import { Listener, Speaker, canListen, loadPrefs, resolveVoice, unlockSpeech, type VoicePrefs } from "@/lib/voice";

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
  suggestions?: { id: string; kind: string; title: string; decided?: "accepted" | "dismissed" }[];
  /** Spoken replies: time from Oliver finishing speaking (or sending) to Maverick's first spoken word. */
  voiceLatencyMs?: number;
  context?: { id: string; category: string; content: string; reason: string }[];
}

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

type StreamEvent =
  | {
      type: "meta";
      conversationId: string;
      model: string;
      tier: string;
      routeReason: string;
      mode: string;
      warnings: string[];
      context: { id: string; category: string; content: string; reason: string }[];
    }
  | { type: "delta"; text: string }
  | { type: "suggestion"; id: string; kind: string; title: string }
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

  // ----- Voice (per device, opt-in in Settings) -----
  const [prefs, setPrefs] = useState<VoicePrefs | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const listenerRef = useRef<Listener | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | undefined>(undefined);
  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    if (p.enabled) void resolveVoice(p).then((v) => (voiceRef.current = v));
    return () => {
      speakerRef.current?.cancel();
      listenerRef.current?.cancel();
    };
  }, []);
  const micAvailable = Boolean(prefs?.enabled) && canListen();

  const stopSpeaking = () => {
    speakerRef.current?.cancel();
    speakerRef.current = null;
    setSpeaking(false);
  };

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
    async (raw: string, opts: { voice?: boolean; spokenAt?: number } = {}) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput("");
      setWarnings([]);
      setVoiceError(null);
      setBusy(true);
      // A new message interrupts anything Maverick is still saying.
      speakerRef.current?.cancel();
      const speakIt = Boolean(prefs?.enabled) && (prefs!.speak === "always" || (prefs!.speak === "voice" && opts.voice));
      let speaker: Speaker | null = null;
      const userId = `u-${Date.now()}`;
      const asstId = `a-${Date.now()}`;
      // The reply's id changes from a temporary one to the saved one when it completes;
      // late callbacks (e.g. speech starting) must patch whichever id is current.
      const current = { id: asstId };
      setMessages((ms) => [...ms, { id: userId, role: "user", content: text, status: "complete" }, { id: asstId, role: "assistant", content: "", status: "streaming" }]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const started = performance.now();
      if (speakIt && prefs) {
        speaker = new Speaker(voiceRef.current, prefs);
        speakerRef.current = speaker;
        const t0 = opts.spokenAt ?? started;
        speaker.onStart = () => {
          setSpeaking(true);
          patchAssistant(current.id, { voiceLatencyMs: Math.round(performance.now() - t0) });
        };
        speaker.onIdle = () => {
          if (speakerRef.current === speaker) {
            speakerRef.current = null;
            setSpeaking(false);
          }
        };
      }
      let gotFirst = false;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, conversationId, deep, voice: Boolean(opts.voice) }),
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
              patchAssistant(asstId, { model: ev.model, routeReason: ev.routeReason, context: ev.context });
            } else if (ev.type === "suggestion") {
              patchAssistant(asstId, (m) => ({ suggestions: [...(m.suggestions ?? []), { id: ev.id, kind: ev.kind, title: ev.title }] }));
            } else if (ev.type === "delta") {
              if (!gotFirst) {
                gotFirst = true;
                patchAssistant(asstId, { firstTokenMs: Math.round(performance.now() - started) });
              }
              patchAssistant(asstId, (m) => ({ content: m.content + ev.text }));
              speaker?.push(ev.text);
            } else if (ev.type === "done") {
              patchAssistant(asstId, { status: "complete", id: ev.assistantMessageId, costUsd: ev.costUsd, latencyMs: ev.latencyMs });
              current.id = ev.assistantMessageId;
              speaker?.finish();
              setSpend(ev.spend);
            } else if (ev.type === "error") {
              patchAssistant(asstId, (m) => ({ status: m.content ? "partial" : "error", content: m.content || ev.message }));
              if (ev.code === "aborted") speaker?.cancel();
              else speaker?.finish();
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
        patchAssistant(current.id, (m) => (m.status === "streaming" ? { status: m.content ? "partial" : "error", content: m.content || "No reply received." } : {}));
        setBusy(false);
        abortRef.current = null;
        void refreshList();
        inputRef.current?.focus();
      }
    },
    [busy, conversationId, deep, refreshList, prefs],
  );

  // Push-to-talk: tap to start, tap again (or pause) to finish. Never listens in the background.
  const toggleMic = () => {
    setVoiceError(null);
    if (listening) {
      listenerRef.current?.stop();
      return;
    }
    if (!prefs) return;
    unlockSpeech(); // iOS: speech must be unlocked inside a tap
    stopSpeaking(); // barge-in
    const listener = new Listener(prefs.lang, {
      onText: (t) => setInput(t),
      onEnd: (finalText) => {
        setListening(false);
        listenerRef.current = null;
        if (!finalText) return;
        if (prefs.autoSend) void send(finalText, { voice: true, spokenAt: performance.now() });
        else {
          setInput(finalText);
          inputRef.current?.focus();
        }
      },
      onError: (m) => {
        setListening(false);
        setVoiceError(m);
      },
    });
    listenerRef.current = listener;
    setListening(true);
    listener.start();
  };

  const cancelMic = () => {
    listenerRef.current?.cancel();
    listenerRef.current = null;
    setListening(false);
    setInput("");
  };

  // Command Center quick-ask: /chat?q=...
  useEffect(() => {
    if (props.initialQuery && !sentInitial.current) {
      sentInitial.current = true;
      window.history.replaceState(null, "", "/chat");
      void send(props.initialQuery);
    }
  }, [props.initialQuery, send]);

  const stop = () => {
    abortRef.current?.abort();
    stopSpeaking();
  };

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
    if (e.key === "Escape" && listening) cancelMic();
    else if (e.key === "Escape" && (busy || speaking)) stop();
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const orbState = listening ? "listening" : speaking ? "speaking" : busy ? (lastAssistant?.content ? "speaking" : "thinking") : "idle";

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
                <p className="small">
                  {micAvailable ? "Type, or tap the microphone and talk." : <>Type below. To talk instead, turn on voice in <a href="/settings#voice">Settings</a>.</>}
                </p>
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
                      {m.voiceLatencyMs !== undefined && <span title="From when you finished speaking to Maverick's first spoken word">🔊 spoke after {(m.voiceLatencyMs / 1000).toFixed(1)}s</span>}
                      {m.status === "partial" && <span className="badge badge-warn">incomplete</span>}
                    </div>
                  )}
                  {m.suggestions && m.suggestions.length > 0 && (
                    <div className="chip-row" aria-label="Suggestions from this reply">
                      {m.suggestions.map((sg) => (
                        <SuggestionChip key={sg.id} s={sg} onDecided={(d) => patchAssistant(m.id, (x) => ({ suggestions: x.suggestions?.map((y) => (y.id === sg.id ? { ...y, decided: d } : y)) }))} />
                      ))}
                    </div>
                  )}
                  {m.status !== "streaming" && m.role === "assistant" && <ContextUsed message={m} />}
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
            {voiceError && <div className="alert alert-error" role="alert">{voiceError}</div>}
            {listening && (
              <div className="voice-bar listening" role="status">
                <span className="rec-dot" aria-hidden />
                <span className="vb-text">Listening… tap the mic when you&apos;re done.</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={cancelMic}>Cancel</button>
              </div>
            )}
            {speaking && !listening && (
              <div className="voice-bar" role="status">
                <span className="vb-text">🔊 Maverick is speaking…</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={stopSpeaking}>Stop speaking</button>
              </div>
            )}
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
              {micAvailable && (
                <button
                  type="button"
                  className={`btn mic-btn${listening ? " on" : ""}`}
                  onClick={toggleMic}
                  disabled={busy && !listening}
                  aria-pressed={listening}
                  aria-label={listening ? "Finish speaking" : "Talk to Maverick"}
                  title={listening ? "Finish speaking" : "Tap and talk"}
                >
                  <Icon.mic width={18} />
                </button>
              )}
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

const CHIP_LABEL: Record<string, string> = { memory: "Remember", task: "Task", goal: "Goal", action: "Suggestion" };

function SuggestionChip({ s, onDecided }: { s: NonNullable<UiMessage["suggestions"]>[number]; onDecided: (d: "accepted" | "dismissed") => void }) {
  const [busy, setBusy] = useState(false);
  const decide = async (action: "accept" | "dismiss") => {
    setBusy(true);
    try {
      await api(`/api/suggestions/${s.id}`, { body: { action } });
      onDecided(action === "accept" ? "accepted" : "dismissed");
    } catch {
      setBusy(false);
    }
  };
  return (
    <span className={`sugg-chip${s.decided ? " decided" : ""}`}>
      <strong>{CHIP_LABEL[s.kind] ?? s.kind}:</strong>
      <span className="what">{s.title}</span>
      {s.decided ? (
        <span className="faint">{s.decided === "accepted" ? "✓ saved" : "dismissed"}</span>
      ) : (
        <>
          <button className="btn btn-sm btn-primary" style={{ minHeight: 28 }} disabled={busy} onClick={() => decide("accept")}>Accept</button>
          <button className="btn btn-sm btn-ghost" style={{ minHeight: 28 }} disabled={busy} onClick={() => decide("dismiss")} aria-label={`Dismiss: ${s.title}`}>✕</button>
        </>
      )}
    </span>
  );
}

/** "Why did Maverick know that?": the memories given to the model for this reply. */
function ContextUsed({ message }: { message: UiMessage }) {
  const [items, setItems] = useState(message.context);
  const load = async () => {
    if (items !== undefined || message.id.startsWith("a-")) return;
    try {
      setItems((await api<{ context: NonNullable<UiMessage["context"]> }>(`/api/messages/${message.id}/context`)).context);
    } catch {
      setItems([]);
    }
  };
  if (items !== undefined && items.length === 0) return null;
  return (
    <details className="ctx-details" onToggle={(e) => (e.currentTarget.open ? void load() : undefined)}>
      <summary>Context used{items ? ` (${items.length} memor${items.length === 1 ? "y" : "ies"})` : ""}</summary>
      {items === undefined ? (
        <p>Loading…</p>
      ) : (
        <ul>
          {items.map((c) => (
            <li key={c.id}>
              {c.content} <span className="faint">({c.reason})</span>
            </li>
          ))}
        </ul>
      )}
      <a href="/memory">Manage memories</a>
    </details>
  );
}
