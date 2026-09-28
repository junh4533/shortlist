/** CLI: print table row counts and company status breakdown without opening the DB by hand (`npm run db-stats`). */
import { statSync } from "node:fs";
import { databaseUrl, dbReady, getClient, localDatabasePath } from "../src/lib/db";

async function main() {
  await dbReady();
  const client = getClient();
  const filePath = localDatabasePath();
  console.log(`Database ${filePath ?? databaseUrl().replace(/\?.*$/, "")}`);
  if (filePath) {
    const sizeMb = statSync(filePath).size / 1e6;
    console.log(`  size ${sizeMb.toFixed(1)} MB (budget: stay under 3000 MB for Turso's 5 GB free tier)`);
  }

  const tables = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts_%' ORDER BY name`,
  );
  console.log("\nRows per table");
  for (const row of tables.rows) {
    const name = String(row.name);
    const count = await client.execute(`SELECT count(*) AS n FROM "${name}"`);
    console.log(`  ${name.padEnd(24)} ${count.rows[0].n}`);
  }

  const jobsByProvider = await client.execute(
    `SELECT ats_provider, sum(closed_at IS NULL) AS open, sum(closed_at IS NOT NULL) AS closed,
            sum(is_us = 1) AS us, sum(length(clean_text)) AS text_bytes
     FROM jobs GROUP BY ats_provider ORDER BY ats_provider`,
  );
  console.log("\nJobs by provider (open / closed / US signal / text MB)");
  for (const row of jobsByProvider.rows) {
    console.log(
      `  ${String(row.ats_provider).padEnd(16)} ${String(row.open).padStart(7)} ${String(row.closed).padStart(7)} ${String(row.us).padStart(7)} ${(Number(row.text_bytes ?? 0) / 1e6).toFixed(1).padStart(8)}`,
    );
  }

  const companies = await client.execute(
    `SELECT ats_provider, status, count(*) AS n FROM companies GROUP BY ats_provider, status ORDER BY ats_provider, status`,
  );
  console.log("\nCompanies by provider and status");
  for (const row of companies.rows) {
    console.log(
      `  ${String(row.ats_provider).padEnd(16)} ${String(row.status).padEnd(8)} ${row.n}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
