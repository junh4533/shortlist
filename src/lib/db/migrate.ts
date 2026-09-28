/** Apply numbered .sql migrations in order and record them in schema_migrations. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { dbReady, getClient } from "./client";

export function migrationsDir(cwd = process.cwd()) {
  return path.join(cwd, "src", "lib", "db", "migrations");
}

/** `${NAME}` placeholders in migration files are replaced from process.env (with defaults). */
const SUBSTITUTION_DEFAULTS: Record<string, string> = {
  OWNER_USER_ID: "local",
};

function substitute(sql: string) {
  return sql.replace(/\$\{([A-Z_]+)\}/g, (_, name: string) => {
    const value = process.env[name] ?? SUBSTITUTION_DEFAULTS[name];
    if (value == null) throw new Error(`Migration placeholder ${name} has no value`);
    return value.replace(/'/g, "''");
  });
}

export async function migrate(options: { log?: boolean } = {}) {
  await dbReady();
  const client = getClient();
  await client.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
  );
  const applied = new Set(
    (await client.execute(`SELECT id FROM schema_migrations`)).rows.map((row) =>
      String(row.id),
    ),
  );
  const files = readdirSync(migrationsDir())
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    if (applied.has(id)) continue;
    const sql = substitute(readFileSync(path.join(migrationsDir(), file), "utf8"));
    const tx = await client.transaction("write");
    try {
      await tx.executeMultiple(sql);
      await tx.execute({
        sql: `INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)`,
        args: [id, new Date().toISOString()],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw new Error(`Migration ${id} failed: ${(error as Error).message}`);
    } finally {
      tx.close();
    }
    ran.push(id);
    if (options.log) console.log(`Applied migration ${id}`);
  }
  if (options.log && ran.length === 0) console.log("Migrations up to date");
  return ran;
}
