/** Copy the local SQLite file into a remote libSQL database (`npm run copy-to-turso`). */
import { createClient } from "@libsql/client";
import { getClient, localDatabasePath, migrate } from "../src/lib/db";

const TABLES = ["companies", "company_sources", "jobs", "job_tracking", "user_profiles", "duplicate_overrides", "seed_domains", "serp_queries"];

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !localDatabasePath()) {
    throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. DATABASE_URL must stay on the local file.");
  }
  await migrate();
  const remote = createClient({ url, authToken: token });
  const local = getClient();
  console.log("Apply migrations on the remote database first (DATABASE_URL=libsql://... npm run migrate).");
  for (const table of TABLES) {
    const rows = await local.execute(`SELECT * FROM "${table}"`);
    if (!rows.rows.length) {
      console.log(`${table}: 0 rows`);
      continue;
    }
    const columns = rows.columns;
    let copied = 0;
    for (let index = 0; index < rows.rows.length; index += 200) {
      const batch = rows.rows.slice(index, index + 200);
      const tx = await remote.transaction("write");
      try {
        for (const row of batch) {
          await tx.execute({
            sql: `INSERT OR REPLACE INTO "${table}" (${columns.map((c) => `"${c}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
            args: columns.map((column) => row[column] as string | number | null),
          });
        }
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      } finally {
        tx.close();
      }
      copied += batch.length;
    }
    console.log(`${table}: ${copied} rows`);
  }
  remote.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
