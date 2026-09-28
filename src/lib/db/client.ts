/** Singleton libSQL client and Drizzle instance: a local file in dev, Turso when DATABASE_URL is libsql://. */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

const DEFAULT_URL = "file:data/jobs.db";

type DbState = { client: Client; db: Db; ready: Promise<void> };

const globalForDb = globalThis as unknown as { __jbDb?: DbState };

export function databaseUrl() {
  return process.env.DATABASE_URL || DEFAULT_URL;
}

export function isLocalDatabase() {
  return databaseUrl().startsWith("file:");
}

/** Absolute path of the local SQLite file, or null for remote databases. */
export function localDatabasePath() {
  const url = databaseUrl();
  return url.startsWith("file:") ? path.resolve(url.slice("file:".length)) : null;
}

function create(): DbState {
  const url = databaseUrl();
  const filePath = localDatabasePath();
  if (filePath) mkdirSync(path.dirname(filePath), { recursive: true });
  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
  const ready = filePath
    ? client
        .executeMultiple("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 30000;")
        .then(() => undefined)
    : Promise.resolve();
  return { client, db: drizzle(client, { schema }), ready };
}

function state() {
  globalForDb.__jbDb ??= create();
  return globalForDb.__jbDb;
}

export function getDb(): Db {
  return state().db;
}

export function getClient(): Client {
  return state().client;
}

/** Resolves once connection pragmas have been applied. */
export function dbReady() {
  return state().ready;
}

function isBusyError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const record = current as { code?: string; message?: string; cause?: unknown };
    if (record.code === "SQLITE_BUSY") return true;
    if (/SQLITE_BUSY|database is locked/i.test(record.message ?? "")) return true;
    current = record.cause;
  }
  return false;
}

/** Retry an operation that failed because another connection holds the write lock. */
export async function withBusyRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !isBusyError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
    }
  }
}
