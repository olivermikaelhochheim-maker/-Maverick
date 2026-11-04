import "server-only";
import { getSettings, localParts, type LifeStore, type Maverick, type User } from "@maverick/core";
import { apiUser } from "./server";

/** Authenticated Life request: the store plus "today" in Oliver's own time zone. */
export async function lifeApi(req: Request): Promise<{ maverick: Maverick; user: User; life: LifeStore; today: string }> {
  const { maverick, user } = await apiUser(req);
  const settings = await getSettings(maverick.db, maverick.cipher, user.id);
  return { maverick, user, life: maverick.deps.life!, today: localParts(settings.timezone).date };
}
