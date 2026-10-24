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
