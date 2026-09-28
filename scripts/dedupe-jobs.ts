/** CLI: delete extra job rows that share the same apply URL (`npm run dedupe-jobs`). */
import { dedupeJobsByUrl, getDb } from "../src/lib/db";
import { jobs } from "../src/lib/db/schema";

const { sqlite, db } = getDb();
const before = db.select().from(jobs).all().length;
const removed = dedupeJobsByUrl(sqlite);
const after = db.select().from(jobs).all().length;
sqlite.close();
console.log(`Jobs before ${before}; removed ${removed} duplicate URLs; ${after} remaining`);
