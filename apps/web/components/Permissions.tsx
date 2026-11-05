"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { toast } from "@/lib/toast";
import { kickLive, MODE_LABEL } from "@/lib/live";

interface Tool {
  name: string;
  agent: string;
  risk: "read" | "low" | "medium" | "high";
  label: string;
  description: string;
  autopilotOk: boolean;
  unavailable: string | null;
}
interface AgentSettings {
  mode: 1 | 2 | 3 | 4;
  halted: boolean;
  dailyAutoActions: number;
  maxSteps: number;
  missionCostUsd: number;
  toolOverrides: Record<string, "auto" | "approve" | "off">;
}

/** What each mode does with a tool of this risk (mirrors the engine's policy). */
function effect(mode: number, t: Tool, ov?: string): string {
  if (ov === "off") return "Off";
  if (t.risk === "read") return "Runs";
  if (mode === 1) return "Recommends";
  if (t.risk === "high") return "Asks";
  if (ov === "approve") return "Asks";
  if (ov === "auto") return "Runs";
  if (mode === 2) return "Asks";
  if (t.risk === "low") return "Runs (limit)";
  return mode === 4 && t.autopilotOk ? "Runs (limit)" : "Asks";
}

export function PermissionsView({ initial, tools, summaries }: { initial: AgentSettings; tools: Tool[]; summaries: Record<string, string> }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);

  const save = async (patch: Partial<AgentSettings>, msg: string) => {
    setBusy(true);
    try {
      const r = await api<{ settings: { agent: AgentSettings } }>("/api/settings", { method: "PUT", body: { agent: patch } });
      setS(r.settings.agent);
      toast(msg);
      kickLive();
    } catch (err) {
      toast({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const setMode = (mode: 1 | 2 | 3 | 4) => {
    if (mode === s.mode) return;
    if (mode > s.mode && !window.confirm(`Switch to mode ${mode} · ${MODE_LABEL[mode]}?\n\n${summaries[mode]}`)) return;
    void save({ mode }, `Autonomy set to ${mode} · ${MODE_LABEL[mode]}.`);
  };
  const setOverride = (tool: Tool, v: string) => {
    const next = { ...s.toolOverrides };
    if (v === "default") delete next[tool.name];
    else next[tool.name] = v as "auto" | "approve" | "off";
    void save({ toolOverrides: next }, `${tool.label}: ${v === "default" ? "follows the mode" : v}.`);
  };

  const [limits, setLimits] = useState({ dailyAutoActions: s.dailyAutoActions, maxSteps: s.maxSteps, missionCostUsd: s.missionCostUsd });

  return (
    <div className="cards">
      <section className="card span-12" aria-labelledby="h-mode">
        <div className="card-head"><h3 id="h-mode">Autonomy mode</h3><span className="tele">global · missions may run lower, never higher</span></div>
        <div className="mode-grid" role="group" aria-label="Autonomy mode">
          {([1, 2, 3, 4] as const).map((n) => (
            <button key={n} className="mode-card" aria-pressed={s.mode === n} disabled={busy} onClick={() => setMode(n)}>
              <div className="k">MODE {n}</div>
              <div className="nm">{MODE_LABEL[n]}</div>
              <p>{summaries[n]}</p>
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: "0.8rem" }}>
          In every mode: Maverick has no tool to send messages, move money, buy, book, post or delete. Email drafts are handed to your own mail app; you press Send.
        </p>
      </section>

      <section className={`card span-12${s.halted ? " danger-panel" : ""}`} aria-labelledby="h-stop">
        <div className="card-head"><h3 id="h-stop">Emergency stop</h3><span className={`st ${s.halted ? "failed" : "done"}`}>{s.halted ? "Engaged" : "Ready"}</span></div>
        <p className="small muted">Stops running steps immediately and blocks every mission and automation until you release it. Also on the E-STOP button in the top bar, on every screen.</p>
        <button
          className={s.halted ? "btn" : "btn btn-danger"}
          disabled={busy}
          onClick={async () => {
            if (s.halted && !window.confirm("Release the emergency stop?")) return;
            setBusy(true);
            try {
              await api("/api/agent/halt", { body: { halted: !s.halted } });
              setS({ ...s, halted: !s.halted });
              kickLive();
              toast(s.halted ? "Emergency stop released." : "EMERGENCY STOP engaged.");
            } catch (err) {
              toast({ text: (err as Error).message, kind: "error" });
            } finally {
              setBusy(false);
            }
          }}
        >
          {s.halted ? "Release emergency stop" : "Engage emergency stop"}
        </button>
      </section>

      <section className="card span-12" aria-labelledby="h-tools">
        <div className="card-head"><h3 id="h-tools">Tool permissions</h3><span className="tele">{tools.length} tools · current mode {s.mode}</span></div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>Tool</th><th>Agent</th><th>Risk</th><th>In mode {s.mode}</th><th>Override</th></tr>
            </thead>
            <tbody>
              {tools.map((t) => {
                const ov = s.toolOverrides[t.name];
                return (
                  <tr key={t.name}>
                    <td>
                      <strong>{t.label}</strong> <span className="tele">{t.name}</span>
                      <div className="small faint">{t.description}{t.unavailable ? ` · ${t.unavailable}` : ""}</div>
                    </td>
                    <td className="small">{t.agent}</td>
                    <td><span className={`risk ${t.risk}`}>{t.risk}</span></td>
                    <td className="small">{effect(s.mode, t, ov)}</td>
                    <td>
                      {t.risk === "read" ? (
                        <select aria-label={`Override for ${t.label}`} value={ov === "off" ? "off" : "default"} disabled={busy} onChange={(e) => setOverride(t, e.target.value)}>
                          <option value="default">Allowed</option>
                          <option value="off">Off</option>
                        </select>
                      ) : (
                        <select aria-label={`Override for ${t.label}`} value={ov ?? "default"} disabled={busy} onChange={(e) => setOverride(t, e.target.value)}>
                          <option value="default">Follow mode</option>
                          <option value="approve">Always ask</option>
                          {t.risk !== "high" && <option value="auto">Allow without asking</option>}
                          <option value="off">Off</option>
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">"Allow without asking" applies in modes 2-4 and still counts against the daily limit. High-risk tools always ask. Advisory mode never executes changes.</p>
      </section>

      <section className="card span-12" aria-labelledby="h-limits">
        <div className="card-head"><h3 id="h-limits">Limits</h3></div>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            void save(limits, "Limits saved.");
          }}
        >
          <div>
            <label htmlFor="l1">Automatic changes per day</label>
            <input id="l1" type="number" min={0} max={200} step={1} value={limits.dailyAutoActions} onChange={(e) => setLimits({ ...limits, dailyAutoActions: Number(e.target.value) })} />
          </div>
          <div>
            <label htmlFor="l2">Max steps per mission</label>
            <input id="l2" type="number" min={1} max={20} step={1} value={limits.maxSteps} onChange={(e) => setLimits({ ...limits, maxSteps: Number(e.target.value) })} />
          </div>
          <div>
            <label htmlFor="l3">Max model cost per mission (USD)</label>
            <input id="l3" type="number" min={0} max={5} step={0.05} value={limits.missionCostUsd} onChange={(e) => setLimits({ ...limits, missionCostUsd: Number(e.target.value) })} />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button className="btn btn-primary" disabled={busy}>Save limits</button>
          </div>
        </form>
        <p className="hint">Monthly and daily spending caps (Settings → Budget) apply on top of these.</p>
      </section>
    </div>
  );
}
