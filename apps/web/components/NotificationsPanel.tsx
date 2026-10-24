"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "checking" | "unsupported" | "insecure" | "not_installed" | "off" | "on" | "blocked" | "server_off";

/**
 * Per-device opt-in for push notifications. Explicit and reversible:
 * nothing is requested from the browser until Oliver taps "Enable".
 */
export function NotificationsPanel({ serverConfigured, consent }: { serverConfigured: boolean; consent: boolean }) {
  const [state, setState] = useState<State>("checking");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!serverConfigured) return setState("server_off");
      if (!window.isSecureContext) return setState("insecure");
      const isIOS = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState(isIOS && !standalone ? "not_installed" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, [serverConfigured]);

  const enable = async () => {
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await api<{ publicKey: string }>("/api/push");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource });
      await api("/api/push", { body: { subscription: sub.toJSON() } });
      setState("on");
      setMsg(consent ? "This device will receive notifications." : "Device registered. Also tick “Allow push notifications” above and save.");
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  const disable = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe();
    }
    setState("off");
    setMsg("Notifications are off for this device.");
  };

  const test = async () => {
    const r = await api<{ status: string; reason?: string }>("/api/push/test", { method: "POST", body: {} });
    setMsg(r.status === "sent" ? "Test sent. It should arrive in a few seconds." : `Not sent: ${r.reason?.replace("_", " ")}.`);
  };

  const explain: Record<State, string> = {
    checking: "Checking this device…",
    server_off: "Notifications aren't set up on the server yet. Run `pnpm configure` on the Mac and restart Maverick.",
    insecure: "Notifications need a secure (https) connection. On iPhone, open Maverick through your Tailscale https address (see README), not http://….local.",
    not_installed: "On iPhone, notifications only work from the home-screen app: tap Share → Add to Home Screen, open Maverick from that icon, then come back here.",
    unsupported: "This browser doesn't support web push notifications.",
    blocked: "Notifications are blocked for Maverick in this browser's settings. Allow them there first.",
    off: "Off on this device.",
    on: "On for this device.",
  };

  return (
    <div>
      <p className="muted small" style={{ marginBottom: "0.6rem" }}>{explain[state]}</p>
      <div className="row" style={{ gap: "0.5rem" }}>
        {state === "off" && <button className="btn btn-primary btn-sm" onClick={enable}>Enable on this device</button>}
        {state === "on" && (
          <>
            <button className="btn btn-sm" onClick={test}>Send a test</button>
            <button className="btn btn-sm btn-ghost" onClick={disable}>Turn off on this device</button>
          </>
        )}
      </div>
      {msg && <p className="small" role="status" style={{ marginTop: "0.6rem" }}>{msg}</p>}
    </div>
  );
}
