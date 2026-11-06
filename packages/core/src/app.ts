import { openDatabase, type Db } from "./db";
import { FieldCipher } from "./util/crypto";
import { getSecret } from "./util/secrets";
import { createProviders, type ProviderSet } from "./llm";
import { ChatService, defaultDeps, type ChatDeps } from "./chat/service";
import { AgendaService, MockCalendarSource, type CalendarSource } from "./integrations/calendar";
import { GoogleCalendarSource, googleConfig, type GoogleConfig } from "./integrations/google";
import { IntegrationStore } from "./integrations/store";
import { CalendarLinkStore } from "./integrations/ics";
import { Notifier, loadOrCreateVapid } from "./notify";
import { BriefingService } from "./briefing";
import { Scheduler } from "./scheduler";
import { MissionEngine } from "./agent/engine";
import { TaskLibrary } from "./library";
import { zonedToUtc } from "./util/time";
import { getSettings } from "./settings";

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
  agent: MissionEngine;
  library: TaskLibrary;
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
  const deps: ChatDeps = { ...base, agenda: new AgendaService(cal.source, integrations, new CalendarLinkStore(db, cipher)) };
  const notifier = new Notifier(db, cipher, await loadOrCreateVapid(db, cipher));
  const briefings = new BriefingService(db, cipher, providers, deps, notifier);
  const agent = new MissionEngine(db, cipher, providers, deps, notifier);
  const library = new TaskLibrary(db, deps, agent.finance, agent.health);
  // The morning briefing opens with what was prepared overnight and today's library picks.
  briefings.setPreparation(async (user, localDate) => {
    const settings = await getSettings(db, cipher, user.id);
    const start = zonedToUtc(localDate, "00:00", settings.timezone).getTime();
    const prep = (await agent.list(user.id, { limit: 20 })).find((m) => m.template === "overnight_prep" && Date.parse(m.createdAt) >= start);
    const picks = (await deps.suggestions.list(user.id, "pending")).filter((s) => s.source === "library" && Date.parse(s.createdAt) >= start).map((s) => s.title);
    const excerpt = prep?.report ? prep.report.slice(0, 1800) : null;
    if (!prep && !picks.length) return null;
    return { missionId: prep?.status === "completed" ? prep.id : null, excerpt, suggestions: picks };
  });
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
    scheduler: new Scheduler(db, cipher, deps, briefings, notifier, agent, library),
    agent,
    library,
  };
}
