export interface QueryResult<T> {
  rows: T[];
}

/**
 * Minimal database interface. Both the embedded PGlite engine (local default)
 * and a real PostgreSQL server (cloud) implement it, so business logic never
 * depends on which one is running.
 */
export interface Db {
  readonly kind: "pglite" | "postgres";
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
