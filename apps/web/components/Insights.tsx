import type { Insight } from "@maverick/core";

const META: Record<Insight["kind"], { icon: string; label: string }> = {
  critical: { icon: "!", label: "Needs attention" },
  warning: { icon: "◆", label: "Heads-up" },
  win: { icon: "✓", label: "Win" },
  tip: { icon: "✦", label: "Suggestion" },
};

/** Rule-based observations from Oliver's data. Kind is shown as icon + label, never colour alone. */
export function Insights({ items }: { items: Insight[] }) {
  if (!items.length) return <p className="empty">All clear. Nothing needs your attention right now.</p>;
  return (
    <ul className="insights">
      {items.map((it, i) => (
        <li key={i} className={`insight ${it.kind} reveal`} style={{ ["--i" as string]: i }}>
          <span className="ico" aria-hidden>{META[it.kind].icon}</span>
          <div>
            <span className="kind">{META[it.kind].label}</span>
            <p>{it.text}</p>
          </div>
          {it.action ? <a className="btn btn-sm" href={it.action.href}>{it.action.label}</a> : <span />}
        </li>
      ))}
    </ul>
  );
}
