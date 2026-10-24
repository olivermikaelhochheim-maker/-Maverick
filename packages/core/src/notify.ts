import { randomUUID } from "node:crypto";
import webpush from "web-push";
import type { Db } from "./db/types";
import type { FieldCipher } from "./util/crypto";
import type { Settings } from "./settings";
import { sha256 } from "./util/crypto";
import { getSecret } from "./util/secrets";
import { audit } from "./audit";
import { inWindow, localParts, zonedToUtc } from "./util/time";
import { log } from "./util/logger";
import { UserFacingError } from "./util/errors";

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapidConfig(): VapidConfig | null {
  const publicKey = getSecret("MAVERICK_VAPID_PUBLIC_KEY");
  const privateKey = getSecret("MAVERICK_VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.MAVERICK_VAPID_SUBJECT || "mailto:maverick@localhost" };
}

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}

/**
 * The server POSTs to whatever endpoint a subscription names, so only accept
 * the real browser push services. Anything else would let a crafted
 * subscription make Maverick call arbitrary URLs.
 */
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function validateSubscription(raw: unknown): PushSubscriptionJson {
  const bad = (): never => {
    throw new UserFacingError("Invalid push subscription.", "bad_subscription");
  };
  if (typeof raw !== "object" || raw === null) bad();
  const r = raw as Record<string, unknown>;
  const keys = r.keys as Record<string, unknown> | undefined;
  if (typeof r.endpoint !== "string" || !keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") bad();
  let url: URL;
  try {
    url = new URL(r.endpoint as string);
  } catch {
    return bad();
  }
  if (url.protocol !== "https:" || !PUSH_HOSTS.some((h) => h.test(url.hostname))) {
    throw new UserFacingError("Push service not recognised.", "bad_subscription");
  }
  return { endpoint: url.toString(), keys: { p256dh: keys!.p256dh as string, auth: keys!.auth as string } };
}

export type NotifyKind = "briefing" | "checkin" | "review" | "reminder" | "test";

export interface NotifyResult {
  status: "sent" | "failed" | "suppressed";
  reason?: "disabled" | "quiet_hours" | "daily_limit" | "no_devices" | "not_configured";
  delivered: number;
}

type Sender = (sub: PushSubscriptionJson, payload: string, opts: webpush.RequestOptions) => Promise<{ statusCode: number }>;

export class Notifier {
  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
    private readonly vapid: VapidConfig | null,
    private readonly sender: Sender = (sub, payload, opts) => webpush.sendNotification(sub, payload, opts),
  ) {}

  get configured() {
    return this.vapid !== null;
  }

  get publicKey() {
    return this.vapid?.publicKey ?? null;
  }

  async subscribe(userId: string, raw: unknown, userAgent?: string | null): Promise<void> {
    const sub = validateSubscription(raw);
    await this.db.query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint_hash, data_enc, user_agent) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (endpoint_hash) DO UPDATE SET user_id = EXCLUDED.user_id, data_enc = EXCLUDED.data_enc, failures = 0`,
      [randomUUID(), userId, sha256(sub.endpoint), this.cipher.encrypt(JSON.stringify(sub)), userAgent?.slice(0, 200) ?? null],
    );
    await audit(this.db, { userId, actor: "user", action: "notifications.device_added" });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.db.query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint_hash = $2", [userId, sha256(endpoint)]);
    await audit(this.db, { userId, actor: "user", action: "notifications.device_removed" });
  }

  async deviceCount(userId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>("SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1", [userId]);
    return Number(rows[0]?.n ?? 0);
  }

  /** Should a notification go out right now? Pure policy, separately testable. */
  async check(userId: string, settings: Settings, now: Date, opts: { ignoreQuietHours?: boolean } = {}): Promise<NotifyResult | null> {
    if (!this.vapid) return { status: "suppressed", reason: "not_configured", delivered: 0 };
    if (!settings.notifications.enabled) return { status: "suppressed", reason: "disabled", delivered: 0 };
    const local = localParts(settings.timezone, now);
    if (!opts.ignoreQuietHours && inWindow(local.hhmm, settings.schedule.quietHours.start, settings.schedule.quietHours.end)) {
      return { status: "suppressed", reason: "quiet_hours", delivered: 0 };
    }
    const dayStart = zonedToUtc(local.date, "00:00", settings.timezone);
    const { rows } = await this.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND status = 'sent' AND created_at >= $2",
      [userId, dayStart.toISOString()],
    );
    if (Number(rows[0]?.n ?? 0) >= settings.notifications.maxPerDay) return { status: "suppressed", reason: "daily_limit", delivered: 0 };
    return null;
  }

  /**
   * Send a push notification to all of Oliver's subscribed devices, if policy allows.
   * The payload is end-to-end encrypted by the Web Push protocol; we still keep it minimal.
   */
  async notify(
    userId: string,
    settings: Settings,
    msg: { kind: NotifyKind; title: string; body: string; url: string },
    now = new Date(),
    opts: { ignoreQuietHours?: boolean } = {},
  ): Promise<NotifyResult> {
    const blocked = await this.check(userId, settings, now, opts);
    if (blocked) {
      await this.record(userId, msg.kind, blocked, now);
      return blocked;
    }
    const { rows } = await this.db.query<{ id: string; data_enc: string }>("SELECT id, data_enc FROM push_subscriptions WHERE user_id = $1", [userId]);
    if (!rows.length) {
      const r: NotifyResult = { status: "suppressed", reason: "no_devices", delivered: 0 };
      await this.record(userId, msg.kind, r, now);
      return r;
    }
    const payload = JSON.stringify({ title: msg.title.slice(0, 80), body: msg.body.slice(0, 180), url: msg.url, tag: msg.kind });
    let delivered = 0;
    for (const row of rows) {
      const sub = JSON.parse(this.cipher.decrypt(row.data_enc)) as PushSubscriptionJson;
      try {
        await this.sender(sub, payload, {
          vapidDetails: this.vapid!,
          TTL: 60 * 60 * 6,
          urgency: msg.kind === "reminder" ? "high" : "normal",
        });
        delivered++;
        await this.db.query("UPDATE push_subscriptions SET last_success_at = now(), failures = 0 WHERE id = $1", [row.id]);
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          // The device unsubscribed or the subscription expired.
          await this.db.query("DELETE FROM push_subscriptions WHERE id = $1", [row.id]);
        } else {
          await this.db.query("UPDATE push_subscriptions SET failures = failures + 1 WHERE id = $1", [row.id]);
          log.warn("push_failed", { statusCode: code });
        }
      }
    }
    const result: NotifyResult = delivered ? { status: "sent", delivered } : { status: "failed", delivered: 0 };
    await this.record(userId, msg.kind, result, now);
    return result;
  }

  private async record(userId: string, kind: NotifyKind, r: NotifyResult, at: Date) {
    // Same clock as the daily-cap check.
    await this.db.query("INSERT INTO notifications (id, user_id, kind, status, reason, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [
      randomUUID(),
      userId,
      kind,
      r.status,
      r.reason ?? null,
      at.toISOString(),
    ]);
  }
}
