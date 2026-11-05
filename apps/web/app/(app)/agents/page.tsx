import Link from "next/link";
import { AGENTS, getSettings, toolCatalog } from "@maverick/core";
import { getMaverick, requireUser } from "@/lib/server";

export default async function Agents() {
  const user = await requireUser();
  const m = await getMaverick();
  const settings = await getSettings(m.db, m.cipher, user.id);
  const tools = toolCatalog(m.agent.env);
  const missions = await m.agent.list(user.id, { limit: 200 });
  const steps = missions.flatMap((x) => x.steps.map((s) => ({ ...s, missionId: x.id, missionTitle: x.title })));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="tele">04 · Agent Operations</span>
          <h1>Agents</h1>
          <p>Seven specialist agents, each limited to its own tools, coordinated by Command. Figures are from the last 200 missions.</p>
        </div>
      </div>
      <div className="cards">
        {(Object.keys(AGENTS) as (keyof typeof AGENTS)[]).map((id) => {
          const mine = steps.filter((s) => s.agent === id);
          const done = mine.filter((s) => s.status === "done").length;
          const failed = mine.filter((s) => s.status === "failed").length;
          const waiting = mine.filter((s) => s.status === "awaiting_approval").length;
          const running = mine.find((s) => s.status === "running");
          const last = mine.filter((s) => s.finishedAt).sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
          const own = tools.filter((t) => t.agent === id);
          return (
            <section key={id} className={`card span-6 agent-card${waiting ? " alert-panel" : ""}`} aria-labelledby={`h-${id}`}>
              <div className="card-head">
                <h3 id={`h-${id}`}>{AGENTS[id].label}</h3>
                <span className={`st ${running ? "running" : waiting ? "awaiting_approval" : "pending"}`}>{running ? "Executing" : waiting ? "Waiting" : "Standby"}</span>
              </div>
              <p className="small muted" style={{ margin: 0 }}>{AGENTS[id].role}</p>
              <div className="telemetry" style={{ marginTop: "0.7rem" }}>
                <div><span className="tele">Steps done</span><div className="v">{done}</div></div>
                <div><span className="tele">Failed</span><div className="v">{failed}</div></div>
                <div><span className="tele">Waiting</span><div className="v">{waiting}</div></div>
              </div>
              {last && <p className="small faint" style={{ margin: "0.6rem 0 0" }}>Last: <Link href={`/missions/${last.missionId}`}>{last.title}</Link> ({last.status})</p>}
              <ul className="tools">
                {own.map((t) => {
                  const ov = settings.agent.toolOverrides[t.name];
                  return (
                    <li key={t.name}>
                      <span>{t.label} <span className="tele">{t.name}</span>{t.unavailable && <span className="small faint"> · unavailable</span>}</span>
                      <span className="row" style={{ gap: "0.3rem" }}>
                        <span className={`risk ${t.risk}`}>{t.risk}</span>
                        {ov && <span className="badge">{ov}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="phase-note" style={{ marginTop: "1rem" }}>Agents are permission scopes inside one engine, not separate AI processes: cheaper, and nothing runs that you can't see. Change what each tool may do in <Link href="/permissions">Permissions</Link>.</p>
    </div>
  );
}
