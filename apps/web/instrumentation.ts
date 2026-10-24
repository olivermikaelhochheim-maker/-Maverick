/**
 * Runs once when the Maverick server starts. Starts the in-process scheduler
 * (briefings, check-ins, reminders, housekeeping). Set MAVERICK_SCHEDULER=off
 * to disable, e.g. in tests.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.MAVERICK_SCHEDULER === "off") return;
  const g = globalThis as unknown as { __maverickScheduler?: boolean };
  if (g.__maverickScheduler) return;
  g.__maverickScheduler = true;
  const { getMaverick } = await import("./lib/maverick");
  try {
    (await getMaverick()).scheduler.start();
  } catch (err) {
    g.__maverickScheduler = false;
    console.error(JSON.stringify({ level: "error", event: "scheduler_start_failed", message: (err as Error).message }));
  }
}
