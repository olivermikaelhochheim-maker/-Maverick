"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/login", { body: { email: f.get("email"), password: f.get("password") } });
          window.location.href = "/";
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function SetupForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("password") !== f.get("confirm")) {
          setError("The two passwords don't match.");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/setup", {
            body: { setupCode: f.get("setupCode"), displayName: f.get("displayName"), email: f.get("email"), password: f.get("password") },
          });
          window.location.href = "/settings?welcome=1";
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="setupCode">Setup code</label>
        <input id="setupCode" name="setupCode" required autoComplete="off" autoFocus />
        <p className="hint">Printed in the terminal when you ran <code>pnpm configure</code>. It proves you&apos;re the owner.</p>
      </div>
      <div className="field">
        <label htmlFor="displayName">What should Maverick call you?</label>
        <input id="displayName" name="displayName" defaultValue="Oliver" required maxLength={60} />
      </div>
      <div className="field">
        <label htmlFor="email">Email (used to sign in)</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        <p className="hint">At least 12 characters. A short phrase of random words works well. Your password manager can generate one.</p>
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
        {busy ? "Creating…" : "Create my account"}
      </button>
    </form>
  );
}

export function LogoutButton() {
  return (
    <button
      className="btn btn-sm"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
        window.location.href = "/login";
      }}
    >
      Sign out
    </button>
  );
}
