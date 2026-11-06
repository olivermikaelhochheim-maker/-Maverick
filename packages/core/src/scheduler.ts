import type { Db } from "./db/types";
import type { FieldCipher } from "./util/crypto";
import type { User } from "./auth";
import { getSettings, type Settings } from "./settings";
import type { BriefingKind, BriefingService } from "./briefing";
import type { ChatDeps } from "./chat/service";
import type { Notifier } from "./notify";
import { localParts, toMinutes } from "./util/time";
import { log } from "./util/logger";
import type { MissionEngine } from "./agent/engine";
import type { TaskLibrary } from "./library";
import { drainNotices, summariseNotices } from "./notify";

/** How long after the scheduled time a missed run still happens (e.g. the Mac was asleep at 05:30). */
export const CATCH_UP_MINUTES: Record<BriefingKind, number> = { morning: 6 * 60, evening: 2 * 60, weekly: 6 * 60 };

/** Pure decision: which scheduled briefings are due right now? */
export function dueBriefings(settings: Settings, now: Date): BriefingKind[] {
  const local = localParts(settings.timezone, now);
  const due: BriefingKind[] = [];
  const inRun = (hhmm: string, kind: BriefingKind) => {
    const start = toMinutes(hhmm);
    // Windows never wrap past midnight: a run belongs to the local day it was scheduled on.
    return local.minutes >= start && local.minutes < Math.min(start + CATCH_UP_MINUTES[kind], 24 * 60);
  };
  if (settings.proactive.morningBriefing && inRun(settings.schedule.briefingTime, "morning")) due.push("morning");
  if (settings.proactive.eveningCheckIn && inRun(settings.schedule.checkInTime, "evening")) due.push("evening");
  if (settings.proactive.weeklyReview && local.weekday === settings.schedule.weeklyReview.day && inRun(settings.schedule.weeklyReview.time, "weekly")) {
    due.push("weekly");
  }
  return due;
}

/**
 * Runs inside the Maverick server process once a minute. Everything it does is
 * idempotent (briefings are unique per local day, reminders are marked once sent),
 * so restarts and overlapping ticks are safe.
 */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
    private readonly deps: ChatDeps,
    private readonly briefings: BriefingService,
    private readonly notifier: Notifier | null,
    private readonly agent: MissionEngine | null = null,
    private readonly library: TaskLibrary | null = null,
  ) {}

  /** Claim a once-a-day job for this local date. True only for the first caller. */
  private async claim(userId: string, job: string, localDate: string): Promise<boolean> {
    const { rows } = await this.db.query("INSERT INTO daily_runs (user_id, job, local_date) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING job", [userId, job, localDate]);
    return rows.length > 0;
  }

  /** Overnight preparation, library picks and the midday digest. Each runs once per local day. */
  async dailyJobs(user: User, settings: Settings, now: Date): Promise<{ overnight: boolean; library: number; digest: number }> {
    const out = { overnight: false, library: 0, digest: 0 };
    const local = localParts(settings.timezone, now);
    const briefing = toMinutes(settings.schedule.briefingTime);
    // 1. An hour before the briefing: a read-only mission that prepares today's picture.
    if (this.agent && settings.proactive.overnightPrep && !settings.agent.halted && local.minutes >= briefing - 60 && local.minutes < briefing + 240) {
      if (await this.claim(user.id, "overnight", local.date)) {
        try {
          await this.agent.create(user, { template: "overnight_prep", source: "automation" }, now);
          this.agent.kick(user.id);
          out.overnight = true;
        } catch (err) {
          log.error("overnight_prep_failed", { error: err as Error });
        }
      }
    }
    // 2. Half an hour before the briefing (or later, catching up): today's library suggestions.
    if (this.library && settings.library.enabled && local.minutes >= briefing - 30) {
      if (await this.claim(user.id, "library", local.date)) {
        try {
          out.library = (await this.library.run(user, settings, now)).length;
        } catch (err) {
          log.error("library_run_failed", { error: err as Error });
        }
      }
    }
    // 3. Midday digest: one push with whatever waited since the briefing.
    const digest = settings.notifications.middayDigest;
    if (this.notifier && digest && local.minutes >= toMinutes(digest) && local.minutes < toMinutes(digest) + 180) {
      if (await this.claim(user.id, "digest", local.date)) {
        const items = await drainNotices(this.db, this.cipher, user.id);
        if (items.length) {
          await this.notifier.notify(user.id, settings, { kind: "digest", title: `Maverick: ${items.length} update${items.length === 1 ? "" : "s"}`, body: summariseNotices(items), url: items.some((i) => i.kind === "approval") ? "/missions" : "/" }, now);
          out.digest = items.length;
        }
      }
    }
    return out;
  }

  start(intervalMs = 60_000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
    setTimeout(() => void this.tick(), 5_000).unref?.();
    // The mission executor runs on its own short loop so approved steps start within seconds.
    this.agent?.start();
    log.info("scheduler_started", { intervalMs });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.agent?.stop();
  }

  async tick(now = new Date()): Promise<{ briefings: string[]; reminders: number; missions: number }> {
    const out = { briefings: [] as string[], reminders: 0, missions: 0 };
    if (this.running) return out;
    this.running = true;
    try {
      const { rows } = await this.db.query<{ id: string; email: string; display_name: string }>("SELECT id, email, display_name FROM users");
      for (const r of rows) {
        const user: User = { id: r.id, email: r.email, displayName: r.display_name };
        const settings = await getSettings(this.db, this.cipher, user.id);
        try {
          await this.dailyJobs(user, settings, now);
        } catch (err) {
          log.error("daily_jobs_failed", { error: err as Error });
        }
        for (const kind of dueBriefings(settings, now)) {
          const local = localParts(settings.timezone, now);
          if (await this.briefings.alreadyDone(user.id, kind, local.date)) continue;
          try {
            const res = await this.briefings.run(user, kind, { now });
            if (res.status === "done") out.briefings.push(kind);
          } catch (err) {
            log.error("briefing_failed", { kind, error: err as Error });
          }
        }
        out.reminders += await this.sendReminders(user, settings, now);
        if (this.agent) {
          try {
            out.missions += (await this.agent.runAutomations(user, now)).length;
          } catch (err) {
            log.error("automations_failed", { error: err as Error });
          }
        }
      }
      await this.deps.memory.purgeExpired();
      await this.deps.suggestions.expireOld();
    } catch (err) {
      log.error("scheduler_tick_failed", { error: err as Error });
    } finally {
      this.running = false;
    }
    return out;
  }

  private async sendReminders(user: User, settings: Settings, now: Date): Promise<number> {
    let sent = 0;
    for (const task of await this.deps.planning.dueReminders(now)) {
      if (task.userId !== user.id) continue;
      if (!this.notifier) {
        await this.deps.planning.markReminded(task.id);
        continue;
      }
      const res = await this.notifier.notify(user.id, settings, { kind: "reminder", title: "Reminder", body: task.title, url: "/planning" }, now);
      // In quiet hours, hold the reminder until they end. Otherwise it's done (shown in-app either way).
      if (res.reason === "quiet_hours") continue;
      await this.deps.planning.markReminded(task.id);
      if (res.status === "sent") sent++;
    }
    return sent;
  }
}
