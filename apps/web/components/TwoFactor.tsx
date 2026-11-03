"use client";

import { useState } from "react";
import { api } from "@/lib/client";

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = codes.join("\n");
  return (
    <div>
      <div className="alert alert-warn">
        <strong>Save these recovery codes now.</strong> Each works once if you lose your phone. They won&apos;t be shown again. Put them in your password manager.
      </div>
      <pre className="recovery-codes" aria-label="Recovery codes">{text}</pre>
      <div className="row" style={{ gap: "0.5rem", marginBottom: "1rem" }}>
        <button type="button" className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
        <a
          className="btn btn-sm"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(`Maverick recovery codes\n\n${text}\n`)}`}
          download="maverick-recovery-codes.txt"
        >
          Download
        </a>
      </div>
      <label className="check field">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I&apos;ve saved my recovery codes
      </label>
      <button className="btn btn-primary" disabled={!saved} onClick={onDone}>Continue</button>
    </div>
  );
}

/** Turn on two-step login: scan, confirm a code, save recovery codes. */
export function TwoFactorSetup({ required }: { required: boolean }) {
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (codes) return <RecoveryCodes codes={codes} onDone={() => (window.location.href = "/")} />;

  if (!setup) {
    return (
      <div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <p className="muted">
          {required
            ? "This Maverick is on the internet, so every sign-in needs a second step: a 6-digit code from your phone. It takes two minutes to set up."
            : "Add a 6-digit code from your phone to every sign-in. Recommended."}
        </p>
        <p className="small muted">You need an authenticator app. The iPhone&apos;s built-in <strong>Passwords</strong> app works, as do Google Authenticator, Microsoft Authenticator and 1Password.</p>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              setSetup(await api<{ secret: string; qrSvg: string }>("/api/auth/2fa/setup", { method: "POST", body: {} }));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Set up two-step login
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          setCodes((await api<{ recoveryCodes: string[] }>("/api/auth/2fa/confirm", { body: { code: f.get("code") } })).recoveryCodes);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <ol className="small" style={{ paddingLeft: "1.2rem" }}>
        <li>
          <strong>On a computer:</strong> scan this QR code with your phone&apos;s camera or authenticator app. <strong>On the phone itself:</strong> long-press the QR code, or copy the setup key below into the app.
        </li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div className="qr-box">
        <img src={`data:image/svg+xml;base64,${btoa(setup.qrSvg)}`} alt="QR code for your authenticator app" width={200} height={200} />
      </div>
      <p className="small">
        Setup key: <code className="setup-key">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
      </p>
      <div className="field">
        <label htmlFor="tf-code">6-digit code</label>
        <input id="tf-code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={7} placeholder="123456" autoFocus />
      </div>
      <button className="btn btn-primary" disabled={busy}>{busy ? "Checking…" : "Turn on two-step login"}</button>
    </form>
  );
}

/** Status and management on the Security page. */
export function TwoFactorCard({ enabled, required, recoveryLeft }: { enabled: boolean; required: boolean; recoveryLeft: number }) {
  const [mode, setMode] = useState<"idle" | "regen" | "disable">("idle");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (codes) return <RecoveryCodes codes={codes} onDone={() => window.location.reload()} />;
  if (!enabled) {
    return (
      <div>
        <p className="muted small">Off. Anyone with your password can sign in.</p>
        <a className="btn btn-sm btn-primary" href="/two-factor">Set up two-step login</a>
      </div>
    );
  }
  return (
    <div>
      <p style={{ margin: 0 }}>
        <span className="badge badge-accent">On</span> Every sign-in needs a code from your phone.
      </p>
      <p className="hint">
        {recoveryLeft} recovery code{recoveryLeft === 1 ? "" : "s"} left{recoveryLeft <= 3 ? ". Generate new ones soon." : "."}
        {required && " Required on this server."}
      </p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {mode === "idle" && (
        <div className="row" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
          <button className="btn btn-sm" onClick={() => setMode("regen")}>New recovery codes</button>
          {!required && <button className="btn btn-sm btn-danger" onClick={() => setMode("disable")}>Turn off</button>}
        </div>
      )}
      {mode !== "idle" && (
        <form
          style={{ marginTop: "0.6rem" }}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setError(null);
            try {
              if (mode === "regen") setCodes((await api<{ recoveryCodes: string[] }>("/api/auth/2fa/recovery", { body: { code: f.get("code") } })).recoveryCodes);
              else {
                await api("/api/auth/2fa/disable", { body: { password: f.get("password"), code: f.get("code") } });
                window.location.reload();
              }
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          {mode === "disable" && (
            <div className="field">
              <label htmlFor="tf-pw">Password</label>
              <input id="tf-pw" name="password" type="password" autoComplete="current-password" required />
            </div>
          )}
          <div className="field">
            <label htmlFor="tf-c">Current 6-digit code</label>
            <input id="tf-c" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={12} />
          </div>
          <div className="row" style={{ gap: "0.5rem" }}>
            <button className={`btn btn-sm ${mode === "disable" ? "btn-danger" : "btn-primary"}`}>{mode === "regen" ? "Generate new codes" : "Turn off two-step login"}</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode("idle")}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
