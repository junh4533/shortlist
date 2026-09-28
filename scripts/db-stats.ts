/** CLI: print table row counts and company status breakdown without opening the DB by hand (`npm run db-stats`). */
import { openSqlite } from "../src/lib/db";

const sqlite = openSqlite();
const tables = sqlite
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  .all() as { name: string }[];

console.log("Rows per table");
for (const { name } of tables) {
  const row = sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number };
  console.log(`  ${name.padEnd(24)} ${row.n}`);
}

const companies = sqlite
  .prepare(`SELECT ats_provider, status, count(*) AS n FROM companies GROUP BY ats_provider, status ORDER BY ats_provider, status`)
  .all() as { ats_provider: string; status: string; n: number }[];
console.log("\nCompanies by provider and status");
for (const row of companies) {
  console.log(`  ${row.ats_provider.padEnd(16)} ${row.status.padEnd(8)} ${row.n}`);
}
sqlite.close();
