import { UserFacingError } from "@maverick/core";
import { apiUser, errorResponse, json, readJson } from "@/lib/server";

export async function GET(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    return json({ publicKey: maverick.notifier.publicKey, devices: await maverick.notifier.deviceCount(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Register this device for push notifications. */
export async function POST(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    if (!maverick.notifier.configured) throw new UserFacingError("Notifications aren't set up on the server. Run `pnpm configure`.", "not_configured", 503);
    const b = await readJson<{ subscription?: unknown }>(req, 8_000);
    await maverick.notifier.subscribe(user.id, b.subscription, req.headers.get("user-agent"));
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const { maverick, user } = await apiUser(req);
    const b = await readJson<{ endpoint?: string }>(req, 8_000);
    if (typeof b.endpoint === "string") await maverick.notifier.unsubscribe(user.id, b.endpoint);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
