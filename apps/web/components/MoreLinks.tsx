"use client";

import Link from "next/link";
import { NAV, SYSTEM_NAV } from "./Shell";

export function MoreLinks() {
  return (
    <div className="cards">
      <section className="card span-6">
        <h3>Operations</h3>
        <ul className="list-plain">
          {NAV.map((n, i) => (
            <li key={n.href}><Link href={n.href} className="row" style={{ gap: "0.6rem" }}><span className="nav-idx">{String(i + 1).padStart(2, "0")}</span><n.icon width={18} height={18} /> {n.label}</Link></li>
          ))}
        </ul>
      </section>
      <section className="card span-6">
        <h3>System</h3>
        <ul className="list-plain">
          {SYSTEM_NAV.map((n) => (
            <li key={n.href}><Link href={n.href} className="row" style={{ gap: "0.6rem" }}><n.icon width={18} height={18} /> {n.label}</Link></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
