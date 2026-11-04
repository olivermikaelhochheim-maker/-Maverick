import { addDays, localParts, zonedToUtc } from "./util/time";

/**
 * Turn a quick line like "Call flight school tomorrow 15:00 !1 #pilot" into a task:
 * title, due date, reminder time, priority and goal. English and Norwegian date words.
 * Whatever isn't recognised stays in the title, so nothing is silently lost.
 */

export interface QuickTask {
  title: string;
  dueDate: string | null;
  remindAt: string | null;
  priority: 1 | 2 | 3;
  goalHint: string | null;
  /** Human-readable list of what was understood, for the preview chips. */
  understood: string[];
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, søndag: 0, monday: 1, mon: 1, mandag: 1, tuesday: 2, tue: 2, tirsdag: 2,
  wednesday: 3, wed: 3, onsdag: 3, thursday: 4, thu: 4, torsdag: 4, friday: 5, fri: 5, fredag: 5,
  saturday: 6, sat: 6, lørdag: 6,
};
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt(date: string, today: string): string {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  const d = new Date(`${date}T12:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

export function parseQuickTask(input: string, tz: string, now = new Date()): QuickTask {
  const local = localParts(tz, now);
  const today = local.date;
  let text = ` ${input.trim()} `;
  let dueDate = null as string | null;
  let time = null as string | null;
  let priority = 2 as 1 | 2 | 3;
  let goalHint = null as string | null;
  const understood: string[] = [];
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re);
    if (m && fn(m) !== false) text = text.replace(m[0], " ");
  };

  // Priority: !1 !2 !3, !high/!low, "urgent"
  take(/\s!(1|2|3|high|low|urgent)(?=\s)/i, (m) => {
    const v = m[1]!.toLowerCase();
    priority = v === "1" || v === "high" || v === "urgent" ? 1 : v === "3" || v === "low" ? 3 : 2;
  });
  take(/\s(urgent|asap|viktig)(?=\s)/i, () => {
    priority = 1;
  });
  // Goal hint: #word
  take(/\s#([\p{L}\p{N}_-]{2,40})(?=\s)/u, (m) => {
    goalHint = m[1]!;
  });
  // Time: 15:00, 9:30, kl 15.30, kl 15, at 3pm. (A dot only with "kl", so "20.11" stays a date.)
  take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)|\skl\.?\s*([01]?\d|2[0-3])[.:]([0-5]\d)(?=\s)/i, (m) => {
    if (m[3]) {
      time = `${m[3].padStart(2, "0")}:${m[4]}`;
      return;
    }
    time = `${m[1]!.padStart(2, "0")}:${m[2]}`;
  });
  if (!time) {
    take(/\s(?:at\s+)?(1[0-2]|0?[1-9])\s?(am|pm)(?=\s)/i, (m) => {
      let h = Number(m[1]) % 12;
      if (m[2]!.toLowerCase() === "pm") h += 12;
      time = `${String(h).padStart(2, "0")}:00`;
    });
  }
  if (!time) {
    take(/\skl\.?\s*([01]?\d|2[0-3])(?=\s)/i, (m) => {
      time = `${m[1]!.padStart(2, "0")}:00`;
    });
  }
  // Dates
  take(/\s(today|tonight|i\s?dag|i\s?kveld)(?=\s)/i, () => {
    dueDate = today;
  });
  if (!dueDate) take(/\s(tomorrow|tmrw|i\s?morgen)(?=\s)/i, () => void (dueDate = addDays(today, 1)));
  if (!dueDate) {
    take(/\s(?:in|om)\s+(\d{1,3})\s+(days?|dager?|weeks?|uker?)(?=\s)/i, (m) => {
      const n = Number(m[1]);
      dueDate = addDays(today, /^(w|u)/i.test(m[2]!) ? n * 7 : n);
    });
  }
  if (!dueDate) take(/\s(next week|neste uke)(?=\s)/i, () => void (dueDate = addDays(today, ((8 - local.weekday) % 7) || 7)));
  if (!dueDate) {
    take(/\s(?:on\s+|på\s+|next\s+)?(sunday|sun|søndag|monday|mon|mandag|tuesday|tue|tirsdag|wednesday|wed|onsdag|thursday|thu|torsdag|friday|fri|fredag|saturday|sat|lørdag)(?=\s)/i, (m) => {
      const target = WEEKDAYS[m[1]!.toLowerCase()]!;
      const delta = ((target - local.weekday + 7) % 7) || 7;
      dueDate = addDays(today, delta);
    });
  }
  if (!dueDate) {
    take(/\s(\d{4})-(\d{2})-(\d{2})(?=\s)/, (m) => {
      dueDate = `${m[1]}-${m[2]}-${m[3]}`;
    });
  }
  if (!dueDate) {
    // 20.11, 20/11, 20.11.2026 (day first, as in Norway)
    take(/\s(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/, (m) => {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      if (d < 1 || d > 31 || mo < 1 || mo > 12) return false;
      // "2.5" is more likely a version or a number than 2 May: need a two-digit part.
      if (!m[3] && m[1]!.length < 2 && m[2]!.length < 2) return false;
      let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(today.slice(0, 4));
      let candidate = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!m[3] && candidate < today) candidate = `${++y}${candidate.slice(4)}`;
      dueDate = candidate;
    });
  }
  // A time without a date means today, or tomorrow if that time has passed.
  if (time && !dueDate) dueDate = time > local.hhmm ? today : addDays(today, 1);

  const title = text.replace(/\s{2,}/g, " ").trim().replace(/^[-–:,\s]+|[-–:,\s]+$/g, "");
  if (dueDate) understood.push(`Due ${fmt(dueDate, today)}`);
  if (time) understood.push(`Reminder ${time}`);
  if (priority !== 2) understood.push(priority === 1 ? "High priority" : "Low priority");
  if (goalHint) understood.push(`Goal: #${goalHint}`);
  return {
    title: title || input.trim(),
    dueDate,
    remindAt: time && dueDate ? zonedToUtc(dueDate, time, tz).toISOString() : null,
    priority,
    goalHint,
    understood,
  };
}
