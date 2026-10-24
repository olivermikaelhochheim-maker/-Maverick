export function serializeCookie(name: string, value: string, opts: { expires: Date; secure: boolean }): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${opts.expires.toUTCString()}`,
    opts.secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}
