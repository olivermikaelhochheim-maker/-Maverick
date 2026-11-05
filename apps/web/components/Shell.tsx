"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "./Toaster";
import { CommandBar } from "./CommandBar";
import { IntelPanel } from "./IntelPanel";
import { LiveProvider, useLive, type LiveStatus } from "@/lib/live";

export const NAV = [
  { href: "/", label: "Command Center", short: "Command", icon: Icon.home, mobile: true },
  { href: "/chat", label: "Intelligence", short: "Intel", icon: Icon.chat, mobile: true },
  { href: "/missions", label: "Mission Control", short: "Missions", icon: Icon.target, mobile: true },
  { href: "/agents", label: "Agent Operations", short: "Agents", icon: Icon.cpu, mobile: false },
  { href: "/ops", label: "Daily Ops", short: "Ops", icon: Icon.calendar, mobile: true },
  { href: "/planning", label: "Projects & Goals", short: "Goals", icon: Icon.check, mobile: false },
  { href: "/finance", label: "Finance", short: "Finance", icon: Icon.wallet, mobile: false },
  { href: "/health", label: "Health & Performance", short: "Health", icon: Icon.pulse, mobile: false },
  { href: "/comms", label: "Communications", short: "Comms", icon: Icon.mail, mobile: false },
  { href: "/research", label: "Research", short: "Research", icon: Icon.search, mobile: false },
  { href: "/automations", label: "Automations", short: "Auto", icon: Icon.repeat, mobile: false },
  { href: "/logs", label: "Logs", short: "Logs", icon: Icon.log, mobile: false },
];

export const SYSTEM_NAV = [
  { href: "/permissions", label: "Permissions", icon: Icon.sliders },
  { href: "/memory", label: "Memory Vault", icon: Icon.brain },
  { href: "/files", label: "Files", icon: Icon.files },
  { href: "/usage", label: "Usage & Budget", icon: Icon.chart },
  { href: "/security", label: "Security", icon: Icon.shield },
  { href: "/settings", label: "Settings", icon: Icon.gear },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

type Counts = Record<string, { n: number; alert?: boolean }>;

export function Shell(props: { children: ReactNode; mode: "live" | "mock"; counts?: Counts; tz: string; initial: LiveStatus | null }) {
  return (
    <LiveProvider initial={props.initial}>
      <ShellInner {...props} />
    </LiveProvider>
  );
}

function ShellInner({ children, mode, counts = {}, tz }: { children: ReactNode; mode: "live" | "mock"; counts?: Counts; tz: string }) {
  const pathname = usePathname();
  const { data } = useLive();
  const [drawer, setDrawer] = useState(false);
  const approvals = data?.status.awaitingApproval ?? 0;
  const allCounts: Counts = { ...counts, ...(approvals ? { "/missions": { n: approvals, alert: true } } : {}) };
  // The chat has its own side list; give it the room.
  const intel = pathname !== "/chat" && !pathname.startsWith("/chat/");
  return (
    <div className={`shell3${intel ? " with-intel" : ""}`}>
      <a href="#main" className="skip-link">Skip to content</a>
      <CommandBar mode={mode} tz={tz} onOpenIntel={() => setDrawer((d) => !d)} />
      <nav className="sidenav" aria-label="Main">
        <ul className="nav-list">
          {NAV.map((n, i) => (
            <li key={n.href}>
              <Link className="nav-link" href={n.href} aria-current={isActive(pathname, n.href) ? "page" : undefined}>
                <span className="nav-idx" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                <n.icon /> {n.label}
                {allCounts[n.href]?.n ? (
                  <span className={`nav-count${allCounts[n.href]!.alert ? " alert" : ""}`} aria-label={`${allCounts[n.href]!.n} need attention`}>{allCounts[n.href]!.n}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
        <div className="nav-section">System</div>
        <ul className="nav-list">
          {SYSTEM_NAV.map((n) => (
            <li key={n.href}>
              <Link className="nav-link" href={n.href} aria-current={isActive(pathname, n.href) ? "page" : undefined}>
                <n.icon /> {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="nav-foot">
          {mode === "mock" ? <span className="badge badge-warn">Mock mode: no AI connected</span> : <span className="badge badge-accent">Live · Claude</span>}
        </div>
      </nav>
      <main id="main" className="main">
        {data?.status.halted && (
          <div className="halt-banner" role="alert">
            <strong>EMERGENCY STOP</strong> All missions and automations are halted. Nothing runs until you release it.
          </div>
        )}
        {children}
      </main>
      {intel && <aside className="intel" aria-label="Intelligence panel"><IntelPanel tz={tz} /></aside>}
      {drawer && (
        <div className="intel-drawer" role="dialog" aria-label="Intelligence panel">
          <div className="close">
            <button className="btn btn-sm btn-ghost" onClick={() => setDrawer(false)}>Close</button>
          </div>
          <div className="intel"><IntelPanel tz={tz} onNavigate={() => setDrawer(false)} /></div>
        </div>
      )}
      <CommandPalette />
      <Toaster />
      <nav className="tabbar" aria-label="Main">
        {NAV.filter((n) => n.mobile).map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(pathname, n.href) ? "page" : undefined}>
            <n.icon /> {n.short}
            {allCounts[n.href]?.n ? <span className="tab-dot" aria-label={`${allCounts[n.href]!.n} need attention`}>{allCounts[n.href]!.n}</span> : null}
          </Link>
        ))}
        <Link href="/more" aria-current={pathname === "/more" || [...NAV.filter((n) => !n.mobile), ...SYSTEM_NAV].some((n) => isActive(pathname, n.href)) ? "page" : undefined}>
          <Icon.grid /> More
        </Link>
      </nav>
    </div>
  );
}
