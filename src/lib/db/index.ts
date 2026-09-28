/** Open data/jobs.db, bootstrap tables with CREATE TABLE IF NOT EXISTS, and run one-off URL dedupe. */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { jobCollapseKey, normalizeJobUrl } from "../url";
import * as schema from "./schema";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS companies (
  ats_provider TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_checked TEXT,
  last_crawled TEXT,
  PRIMARY KEY (ats_provider, slug)
);

CREATE TABLE IF NOT EXISTS jobs (
  ats_provider TEXT NOT NULL,
  board_slug TEXT NOT NULL,
  external_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  department TEXT,
  location TEXT,
  clean_text TEXT NOT NULL,
  url TEXT NOT NULL,
  is_remote INTEGER,
  workplace_type TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_unknown INTEGER NOT NULL,
  posted_at TEXT,
  updated_at TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (ats_provider, board_slug, external_id)
);

CREATE TABLE IF NOT EXISTS job_tracking (
  ats_provider TEXT NOT NULL,
  board_slug TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  note TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ats_provider, board_slug, external_id)
);
`;

export function getSqlitePath(cwd = process.cwd()) {
  return path.join(cwd, "data", "jobs.db");
}

type JobKeyRow = {
  rowid: number;
  url: string;
  ats_provider: string;
  board_slug: string;
  external_id: string;
  company_name: string;
  fetched_at: string;
};

/** Group by jobCollapseKey, keep the best row, copy tracking onto the survivor, delete extras. */
export function dedupeJobsByUrl(sqlite: InstanceType<typeof Database>) {
  const rows = sqlite
    .prepare(
      `SELECT rowid, url, ats_provider, board_slug, external_id, company_name, fetched_at FROM jobs`,
    )
    .all() as JobKeyRow[];

  const groups = new Map<string, JobKeyRow[]>();
  for (const row of rows) {
    const key = jobCollapseKey({
      url: row.url,
      atsProvider: row.ats_provider,
      externalId: row.external_id,
    });
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const updateUrl = sqlite.prepare(`UPDATE jobs SET url = ? WHERE rowid = ?`);
  const deleteJob = sqlite.prepare(`DELETE FROM jobs WHERE rowid = ?`);
  const hasTracking = sqlite.prepare(
    `SELECT 1 AS ok FROM job_tracking
     WHERE ats_provider = ? AND board_slug = ? AND external_id = ?`,
  );
  const copyTracking = sqlite.prepare(
    `INSERT OR IGNORE INTO job_tracking (ats_provider, board_slug, external_id, status, note, updated_at)
     SELECT ?, ?, ?, status, note, updated_at FROM job_tracking
     WHERE ats_provider = ? AND board_slug = ? AND external_id = ?`,
  );
  const deleteTracking = sqlite.prepare(
    `DELETE FROM job_tracking
     WHERE ats_provider = ? AND board_slug = ? AND external_id = ?`,
  );

  let removed = 0;
  const apply = sqlite.transaction(() => {
    for (const [, group] of groups) {
      group.sort((left, right) => {
        const leftName =
          left.company_name.toLowerCase() === left.board_slug.toLowerCase()
            ? 0
            : 1;
        const rightName =
          right.company_name.toLowerCase() === right.board_slug.toLowerCase()
            ? 0
            : 1;
        if (rightName !== leftName) return rightName - leftName;
        const byDate = String(right.fetched_at).localeCompare(
          String(left.fetched_at),
        );
        return byDate !== 0 ? byDate : right.rowid - left.rowid;
      });
      const keep = group[0];
      const normalized = normalizeJobUrl(keep.url);
      if (normalized && keep.url !== normalized) {
        updateUrl.run(normalized, keep.rowid);
      }
      for (const extra of group.slice(1)) {
        const keepHas = hasTracking.get(
          keep.ats_provider,
          keep.board_slug,
          keep.external_id,
        );
        if (!keepHas) {
          copyTracking.run(
            keep.ats_provider,
            keep.board_slug,
            keep.external_id,
            extra.ats_provider,
            extra.board_slug,
            extra.external_id,
          );
        }
        deleteTracking.run(
          extra.ats_provider,
          extra.board_slug,
          extra.external_id,
        );
        deleteJob.run(extra.rowid);
        removed += 1;
      }
    }
  });
  apply();
  return removed;
}

export function openSqlite(cwd = process.cwd()) {
  const dbPath = getSqlitePath(cwd);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(SCHEMA_SQL);
  return sqlite;
}

export function getDb(cwd = process.cwd()) {
  const sqlite = openSqlite(cwd);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
