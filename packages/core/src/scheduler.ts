import type { Db } from "./db/types";
import type { FieldCipher } from "./util/crypto";
import type { User } from "./auth";
import { getSettings, type Settings } from "./settings";
import type { BriefingKind, BriefingService } from "./briefing";
import type { ChatDeps } from "./chat/service";
import type { Notifier } from "./notify";
import { localParts, toMinutes } from "./util/time";
import { log } from "./util/logger";

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
  ) {}

  start(intervalMs = 60_000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
    setTimeout(() => void this.tick(), 5_000).unref?.();
    log.info("scheduler_started", { intervalMs });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = new Date()): Promise<{ briefings: string[]; reminders: number }> {
    const out = { briefings: [] as string[], reminders: 0 };
    if (this.running) return out;
    this.running = true;
    try {
      const { rows } = await this.db.query<{ id: string; email: string; display_name: string }>("SELECT id, email, display_name FROM users");
      for (const r of rows) {
        const user: User = { id: r.id, email: r.email, displayName: r.display_name };
        const settings = await getSettings(this.db, this.cipher, user.id);
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
