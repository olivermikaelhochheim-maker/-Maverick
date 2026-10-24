import { createHash } from "node:crypto";
import { randomToken } from "../util/crypto";
import { getSecret } from "../util/secrets";
import { log } from "../util/logger";
import type { IntegrationStore, OAuthTokens } from "./store";
import type { CalendarEvent, CalendarSource } from "./calendar";

/** Read-only calendar access, plus the account email for display. Nothing else. */
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Google OAuth client credentials from env/Keychain. Null when not set up yet. */
export function googleConfig(publicUrl = process.env.MAVERICK_PUBLIC_URL || "http://localhost:3000"): GoogleConfig | null {
  const clientId = getSecret("GOOGLE_CLIENT_ID");
  const clientSecret = getSecret("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${publicUrl.replace(/\/$/, "")}/api/integrations/google/callback` };
}

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    public readonly needsReauth: boolean,
  ) {
    super(message);
  }
}

type FetchLike = typeof fetch;

/** PKCE: a random verifier kept server-side (in a short-lived cookie) and its SHA-256 challenge sent to Google. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthUrl(cfg: GoogleConfig, state: string, challenge: string): string {
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline", // ask for a refresh token so the morning briefing works without Oliver present
    prompt: "consent",
    include_granted_scopes: "false",
  }).toString();
  return u.toString();
}

function tokensFrom(json: Record<string, unknown>, previousRefresh: string | null = null): OAuthTokens {
  return {
    accessToken: String(json.access_token),
    refreshToken: (json.refresh_token as string | undefined) ?? previousRefresh,
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
  };
}

function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    // Received directly from Google over TLS; used for display only.
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export async function exchangeCode(
  cfg: GoogleConfig,
  code: string,
  verifier: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ tokens: OAuthTokens; scopes: string[]; email: string | null }> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new GoogleAuthError(`Google refused the sign-in (${String(json.error ?? res.status)}).`, false);
  const scopes = String(json.scope ?? "").split(" ").filter(Boolean);
  if (!scopes.includes("https://www.googleapis.com/auth/calendar.readonly")) {
    throw new GoogleAuthError("Calendar access wasn't granted. Tick the calendar box on Google's consent screen.", false);
  }
  return { tokens: tokensFrom(json), scopes, email: emailFromIdToken(json.id_token) };
}

export async function refreshTokens(cfg: GoogleConfig, refreshToken: string, fetchImpl: FetchLike = fetch): Promise<OAuthTokens> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const needsReauth = json.error === "invalid_grant" || res.status === 400 || res.status === 401;
    throw new GoogleAuthError(`Google token refresh failed (${String(json.error ?? res.status)}).`, needsReauth);
  }
  return tokensFrom(json, refreshToken);
}

export async function revokeToken(token: string, fetchImpl: FetchLike = fetch): Promise<void> {
  await fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }).catch(() => undefined);
}

/** Reads events from the calendars Oliver has selected in Google Calendar. Read-only. */
export class GoogleCalendarSource implements CalendarSource {
  readonly id = "google";
  constructor(
    private readonly store: IntegrationStore,
    private readonly cfg: GoogleConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async accessToken(userId: string): Promise<string> {
    const t = await this.store.tokens(userId, "google");
    if (!t) throw new GoogleAuthError("Google Calendar isn't connected.", true);
    if (t.expiresAt - Date.now() > 60_000) return t.accessToken;
    if (!t.refreshToken) throw new GoogleAuthError("Google sign-in expired. Reconnect Google Calendar.", true);
    try {
      const fresh = await refreshTokens(this.cfg, t.refreshToken, this.fetchImpl);
      await this.store.updateTokens(userId, "google", fresh);
      return fresh.accessToken;
    } catch (err) {
      if (err instanceof GoogleAuthError && err.needsReauth) await this.store.markNeedsReauth(userId, "google", err.message);
      throw err;
    }
  }

  private async get(token: string, url: string): Promise<Record<string, unknown>> {
    const res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Google Calendar request failed (${res.status}).`);
    return (await res.json()) as Record<string, unknown>;
  }

  async listEvents(userId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    const token = await this.accessToken(userId);
    const list = await this.get(token, `${API}/users/me/calendarList?minAccessRole=reader&maxResults=50`);
    const calendars = ((list.items as Record<string, unknown>[]) ?? []).filter((c) => c.selected !== false).slice(0, 10);
    const events: CalendarEvent[] = [];
    for (const cal of calendars) {
      const params = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
      });
      try {
        const data = await this.get(token, `${API}/calendars/${encodeURIComponent(String(cal.id))}/events?${params}`);
        for (const e of (data.items as Record<string, unknown>[]) ?? []) {
          if (e.status === "cancelled") continue;
          const start = e.start as { dateTime?: string; date?: string } | undefined;
          const end = e.end as { dateTime?: string; date?: string } | undefined;
          // Skip events Oliver declined.
          const me = ((e.attendees as { self?: boolean; responseStatus?: string }[]) ?? []).find((a) => a.self);
          if (me?.responseStatus === "declined") continue;
          events.push({
            id: String(e.id),
            title: String(e.summary ?? "(no title)").slice(0, 200),
            start: start?.dateTime ?? start?.date ?? "",
            end: end?.dateTime ?? end?.date ?? "",
            allDay: Boolean(start?.date && !start?.dateTime),
            location: typeof e.location === "string" ? e.location.slice(0, 200) : null,
            calendar: String(cal.summaryOverride ?? cal.summary ?? "Calendar").slice(0, 80),
          });
        }
      } catch (err) {
        log.warn("google_calendar_events_failed", { error: err as Error });
      }
    }
    return events.sort((a, b) => a.start.localeCompare(b.start));
  }
}
