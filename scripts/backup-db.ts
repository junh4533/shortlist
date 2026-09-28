/** CLI: copy data/jobs.db to a timestamped .bak after a WAL checkpoint (`npm run backup-db`). */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function backupDb(cwd = process.cwd()) {
  const source = path.join(cwd, "data", "jobs.db");
  if (!existsSync(source)) {
    console.log("No data/jobs.db to back up");
    return null;
  }
  const sqlite = new Database(source);
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  sqlite.close();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(cwd, "data", `jobs.${stamp}.db.bak`);
  copyFileSync(source, dest);
  console.log(`Backed up to ${dest}`);
  return dest;
}

if (process.argv[1]?.endsWith("backup-db.ts")) {
  backupDb();
}
