"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./Icons";
import { Orb } from "./Orb";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "./Toaster";

const NAV = [
  { href: "/", label: "Command Center", short: "Home", icon: Icon.home, mobile: true },
  { href: "/chat", label: "Conversation", short: "Chat", icon: Icon.chat, mobile: true },
  { href: "/planning", label: "Goals & Tasks", short: "Plan", icon: Icon.check, mobile: true },
  { href: "/memory", label: "Memory Vault", short: "Memory", icon: Icon.brain, mobile: true },
  { href: "/files", label: "Files", short: "Files", icon: Icon.files, mobile: false },
  { href: "/usage", label: "Usage & Budget", short: "Usage", icon: Icon.chart, mobile: false },
  { href: "/security", label: "Security", short: "Security", icon: Icon.shield, mobile: false },
  { href: "/settings", label: "Settings", short: "More", icon: Icon.gear, mobile: true },
];

// Shown so the roadmap is visible, but clearly not available yet.
const LOCKED = [
  { label: "Zorza CEO", phase: 5 },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

type Counts = Record<string, { n: number; alert?: boolean }>;

export function Shell({ children, mode, counts = {} }: { children: ReactNode; mode: "live" | "mock"; counts?: Counts }) {
  const pathname = usePathname();
  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <nav className="sidenav" aria-label="Main">
        <div className="brand">
          <span className="brand-mark"><Orb size={26} /></span>
          MAVERICK
        </div>
        <button className="cmd-trigger" onClick={() => window.dispatchEvent(new Event("mvk:palette"))}>
          <span>✦ Search or do…</span> <span className="kbd">⌘K</span>
        </button>
        <ul className="nav-list">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link className="nav-link" href={n.href} aria-current={isActive(pathname, n.href) ? "page" : undefined}>
                <n.icon /> {n.label}
                {counts[n.href]?.n ? (
                  <span className={`nav-count${counts[n.href]!.alert ? " alert" : ""}`} aria-label={`${counts[n.href]!.n} need attention`}>{counts[n.href]!.n}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
        <div className="nav-section">Coming later</div>
        <ul className="nav-list">
          {LOCKED.map((n) => (
            <li key={n.label}>
              <span className="nav-link nav-locked" title={`Arrives in Phase ${n.phase}`}>
                <Icon.lock /> {n.label} <span className="badge" style={{ marginLeft: "auto" }}>Phase {n.phase}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="nav-foot">
          {mode === "mock" ? <span className="badge badge-warn">Mock mode: no AI connected</span> : <span className="badge badge-accent">Live · Claude</span>}
        </div>
      </nav>
      <main id="main" className="main">{children}</main>
      <CommandPalette />
      <Toaster />
      <nav className="tabbar" aria-label="Main">
        {NAV.filter((n) => n.mobile).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(pathname, n.href) || (n.href === "/settings" && ["/usage", "/security", "/files"].some((p) => isActive(pathname, p))) ? "page" : undefined}
          >
            <n.icon /> {n.short}
            {counts[n.href]?.n ? <span className="tab-dot" aria-label={`${counts[n.href]!.n} need attention`}>{counts[n.href]!.n}</span> : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
