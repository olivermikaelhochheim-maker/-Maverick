import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Db, QueryResult } from "./types";
import { migrate } from "./migrations";
import { log } from "../util/logger";

export type { Db } from "./types";
export { migrate } from "./migrations";

type PGliteLike = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: PGliteLike) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

function wrapPglite(pg: PGliteLike, isTx = false): Db {
  return {
    kind: "pglite",
    query: async <T>(sql: string, params?: unknown[]) => (await pg.query<T>(sql, params)) as QueryResult<T>,
    exec: async (sql: string) => {
      await pg.exec(sql);
    },
    transaction: (fn) => (isTx ? fn(wrapPglite(pg, true)) : pg.transaction((tx) => fn(wrapPglite(tx, true)))),
    close: () => pg.close(),
  };
}

/** Embedded PostgreSQL (WASM). `dataDir` undefined = in-memory (tests). */
export async function openPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  return wrapPglite(pg as unknown as PGliteLike);
}

/** A real PostgreSQL server, e.g. Neon/Supabase/Postgres.app. */
export async function openPostgres(connectionString: string): Promise<Db> {
  const pgMod = await import("pg");
  const Pool = pgMod.default?.Pool ?? (pgMod as unknown as { Pool: typeof import("pg").Pool }).Pool;
  const pool = new Pool({ connectionString, max: 5 });

  const make = (client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }): Db => ({
    kind: "postgres",
    query: async <T>(sql: string, params?: unknown[]) => (await client.query(sql, params)) as QueryResult<T>,
    exec: async (sql: string) => {
      await client.query(sql);
    },
    transaction: async (fn) => fn(make(client)), // nested: reuse the same client
    close: async () => {},
  });

  return {
    kind: "postgres",
    query: async <T>(sql: string, params?: unknown[]) => (await pool.query(sql, params)) as unknown as QueryResult<T>,
    exec: async (sql: string) => {
      await pool.query(sql);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(make(client));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/**
 * Open the configured database and apply migrations.
 * DATABASE_URL set   -> PostgreSQL server
 * otherwise          -> embedded PGlite in MAVERICK_DATA_DIR (default ./data/pglite)
 */
export async function openDatabase(opts: { databaseUrl?: string; dataDir?: string } = {}): Promise<Db> {
  const url = opts.databaseUrl ?? process.env.DATABASE_URL;
  let db: Db;
  if (url) {
    db = await openPostgres(url);
  } else {
    const dir = opts.dataDir ?? process.env.MAVERICK_DATA_DIR ?? path.resolve(process.cwd(), "data", "pglite");
    db = await openPglite(dir);
  }
  const ran = await migrate(db);
  log.info("db_ready", { kind: db.kind, migrationsApplied: ran });
  return db;
}
