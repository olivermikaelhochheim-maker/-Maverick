/**
 * Structured JSON logger with redaction.
 *
 * Anything whose key looks sensitive (passwords, tokens, keys, cookies, message
 * content) is replaced with "[redacted]" before it is written. Logs never
 * contain conversation text by default.
 */

const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|content|text|prompt|email|setup[-_]?code/i;

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return redactString(value);
  return value;
}

/** Strip things that look like API keys or bearer tokens from free text. */
export function redactString(s: string): string {
  return s
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}

function minLevel(): number {
  const env = (process.env.MAVERICK_LOG_LEVEL ?? "info") as LogLevel;
  return LEVELS[env] ?? LEVELS.info;
}

function write(level: LogLevel, event: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < minLevel()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => write("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
