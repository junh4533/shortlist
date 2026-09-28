/** CLI: delete extra job rows that share the same apply URL (`npm run dedupe-jobs`). */
import { sql } from "drizzle-orm";
import { getDb, migrate } from "../src/lib/db";
import { dedupeJobsByUrl } from "../src/lib/db/dedupe";
import { jobs } from "../src/lib/db/schema";

async function countJobs() {
  const [{ n }] = await getDb().select({ n: sql<number>`count(*)` }).from(jobs);
  return n;
}

async function main() {
  await migrate();
  const before = await countJobs();
  const removed = await dedupeJobsByUrl();
  const after = await countJobs();
  console.log(`Jobs before ${before}; removed ${removed} duplicate URLs; ${after} remaining`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
