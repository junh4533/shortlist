/** CLI: copy the local SQLite file to a timestamped .bak after a WAL checkpoint (`npm run backup-db`). */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { dbReady, getClient, localDatabasePath } from "../src/lib/db";

export async function backupDb() {
  const source = localDatabasePath();
  if (!source) {
    console.log("DATABASE_URL is remote; use your provider's backups instead");
    return null;
  }
  if (!existsSync(source)) {
    console.log(`No ${source} to back up`);
    return null;
  }
  await dbReady();
  await getClient().execute("PRAGMA wal_checkpoint(TRUNCATE)");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(path.dirname(source), `jobs.${stamp}.db.bak`);
  copyFileSync(source, dest);
  console.log(`Backed up to ${dest}`);
  return dest;
}

if (process.argv[1]?.endsWith("backup-db.ts")) {
  backupDb().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
