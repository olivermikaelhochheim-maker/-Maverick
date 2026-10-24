"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** JSON fetch helper for the browser. Redirects to /login when the session has expired. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data.code === "unauthenticated") window.location.href = "/login";
    throw new ApiError(data.error ?? `Request failed (${res.status})`, data.code ?? "unknown", res.status);
  }
  return data as T;
}

export const usd = (n: number, digits = 2) =>
  `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(digits)}`;
