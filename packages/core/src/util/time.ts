/** Start of the current calendar month and day in UTC. Budget periods use UTC in Phase 1. */
export function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function dayStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** e.g. "Saturday 24 October 2026, 17:05 (Europe/Stockholm)" */
export function formatLocalNow(tz: string, now = new Date()): string {
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `${s} (${zone})`;
}

export interface LocalParts {
  /** YYYY-MM-DD in the given zone */
  date: string;
  /** HH:MM (24h) */
  hhmm: string;
  /** minutes since local midnight */
  minutes: number;
  /** 0 = Sunday */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function localParts(tz: string, now = new Date()): LocalParts {
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const hhmm = `${parts.hour}:${parts.minute}`;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm,
    minutes: toMinutes(hhmm),
    weekday: WEEKDAYS.indexOf(parts.weekday as string),
  };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Is `hhmm` inside [start, end)? Handles windows that cross midnight (e.g. 22:00–05:00). */
export function inWindow(hhmm: string, start: string, end: string): boolean {
  const t = toMinutes(hhmm);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** Convert a wall-clock time in `tz` (date YYYY-MM-DD, time HH:MM) to a UTC Date. DST-safe. */
export function zonedToUtc(date: string, hhmm: string, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const target = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // Iterate: guess UTC = wall time, then correct by the zone's offset at that instant.
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(tz, new Date(guess));
    const [py, pm, pd] = p.date.split("-").map(Number);
    const asUtc = Date.UTC(py!, pm! - 1, pd!, Math.floor(p.minutes / 60), p.minutes % 60);
    const diff = target - asUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** Add days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}
