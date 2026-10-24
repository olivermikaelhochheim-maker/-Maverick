import { createMaverick, type Maverick } from "@maverick/core";

/**
 * One Maverick instance per server process. Stored on globalThis so dev-mode
 * hot reloads (and the instrumentation hook) don't open a second handle on the
 * embedded database.
 */
const g = globalThis as unknown as { __maverick?: Promise<Maverick> };

export function getMaverick(): Promise<Maverick> {
  g.__maverick ??= createMaverick().catch((err) => {
    g.__maverick = undefined;
    throw err;
  });
  return g.__maverick;
}
