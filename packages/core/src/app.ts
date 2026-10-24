import { openDatabase, type Db } from "./db";
import { FieldCipher } from "./util/crypto";
import { getSecret } from "./util/secrets";
import { createProviders, type ProviderSet } from "./llm";
import { ChatService, defaultDeps, type ChatDeps } from "./chat/service";
import { AgendaService, MockCalendarSource, type CalendarSource } from "./integrations/calendar";
import { GoogleCalendarSource, googleConfig, type GoogleConfig } from "./integrations/google";
import { IntegrationStore } from "./integrations/store";
import { Notifier, vapidConfig } from "./notify";
import { BriefingService } from "./briefing";
import { Scheduler } from "./scheduler";

export interface Maverick {
  db: Db;
  cipher: FieldCipher;
  providers: ProviderSet;
  chat: ChatService;
  deps: ChatDeps;
  integrations: IntegrationStore;
  google: GoogleConfig | null;
  calendarMode: "google" | "mock" | "none";
  notifier: Notifier;
  briefings: BriefingService;
  scheduler: Scheduler;
}

/**
 * Calendar source:
 *   MAVERICK_CALENDAR_PROVIDER=mock -> demo calendar (tests, trying it out)
 *   Google client credentials set   -> Google Calendar (read-only)
 *   otherwise                       -> none ("not connected")
 */
function calendarSource(integrations: IntegrationStore, google: GoogleConfig | null): { source: CalendarSource | null; mode: Maverick["calendarMode"] } {
  if (process.env.MAVERICK_CALENDAR_PROVIDER === "mock") return { source: new MockCalendarSource(), mode: "mock" };
  if (google) return { source: new GoogleCalendarSource(integrations, google), mode: "google" };
  return { source: null, mode: "none" };
}

/** Wire up the app: database, encryption, model providers, stores, calendar, notifications, scheduler. */
export async function createMaverick(opts: { db?: Db; dataKey?: string; providers?: ProviderSet } = {}): Promise<Maverick> {
  const dataKey = opts.dataKey ?? getSecret("MAVERICK_DATA_KEY");
  if (!dataKey) {
    throw new Error("MAVERICK_DATA_KEY is missing. Run `pnpm configure` from the project folder first.");
  }
  const cipher = new FieldCipher(dataKey);
  const db = opts.db ?? (await openDatabase());
  const providers = opts.providers ?? createProviders();
  const integrations = new IntegrationStore(db, cipher);
  const google = googleConfig();
  const cal = calendarSource(integrations, google);
  const base = defaultDeps(db, cipher);
  const deps: ChatDeps = { ...base, agenda: new AgendaService(cal.source, integrations) };
  const notifier = new Notifier(db, cipher, vapidConfig());
  const briefings = new BriefingService(db, cipher, providers, deps, notifier);
  return {
    db,
    cipher,
    providers,
    deps,
    integrations,
    google,
    calendarMode: cal.mode,
    notifier,
    briefings,
    chat: new ChatService(db, cipher, providers, deps),
    scheduler: new Scheduler(db, cipher, deps, briefings, notifier),
  };
}
