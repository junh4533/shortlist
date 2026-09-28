/** CLI: SERP gap-fill with a mandatory query cap (`npm run harvest-serp -- --provider serper --max-queries 50`). */
import { gte, sql } from "drizzle-orm";
import { loadSystemConfig } from "../src/lib/config";
import { getDb, migrate } from "../src/lib/db";
import { serpQueries } from "../src/lib/db/schema";
import { upsertCompanies } from "../src/lib/harvest/insert";
import { generateSerpQueries, runSerpHarvest, type SerpProvider } from "../src/lib/harvest/serp";
import { createSerpApi } from "../src/lib/harvest/serp/serpapi";
import { createSerper } from "../src/lib/harvest/serp/serper";

const REPEAT_WINDOW_MS = 30 * 86_400_000;

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function usage() {
  console.log(`Usage:
  npm run harvest-serp -- --provider serper --max-queries 50     (needs SERPER_API_KEY)
  npm run harvest-serp -- --provider serpapi --max-queries 20    (needs SERPAPI_API_KEY)
  Add --dry-run to list the queries that would run without calling any API.`);
}

function createProvider(id: string): SerpProvider {
  if (id === "serper") {
    const key = process.env.SERPER_API_KEY;
    if (!key) throw new Error("Set SERPER_API_KEY");
    return createSerper(key);
  }
  if (id === "serpapi") {
    const key = process.env.SERPAPI_API_KEY;
    if (!key) throw new Error("Set SERPAPI_API_KEY");
    return createSerpApi(key);
  }
  throw new Error(`Unknown provider ${id}`);
}

async function main() {
  const providerId = argValue("--provider");
  const maxQueries = Number(argValue("--max-queries"));
  if (process.argv.includes("--help") || !providerId || !Number.isFinite(maxQueries) || maxQueries < 1) {
    usage();
    if (providerId && !(maxQueries >= 1)) console.error("\n--max-queries is required so a run can never overspend.");
    return;
  }

  await migrate();
  const db = getDb();
  const since = new Date(Date.now() - REPEAT_WINDOW_MS).toISOString();
  const recent = new Set(
    (await db.select({ query: serpQueries.query }).from(serpQueries).where(gte(serpQueries.runAt, since))).map(
      (row) => row.query,
    ),
  );
  const queries = generateSerpQueries();
  const enabled = new Set(loadSystemConfig().ingest.providers);

  if (process.argv.includes("--dry-run")) {
    const pending = queries.filter((query) => !recent.has(query)).slice(0, maxQueries);
    console.log(`${queries.length} queries total, ${recent.size} run in the last 30 days. Would run:`);
    for (const query of pending) console.log(`  ${query}`);
    return;
  }

  const provider = createProvider(providerId);
  let newSlugs = 0;
  const result = await runSerpHarvest({
    provider,
    queries,
    maxQueries,
    ranRecently: (query) => recent.has(query),
    record: async (query, results, refs) => {
      const upserted = await upsertCompanies(
        refs.filter((ref) => enabled.has(ref.atsProvider)),
        `serp:${provider.id}`,
      );
      newSlugs += upserted.inserted;
      await db
        .insert(serpQueries)
        .values({ query, provider: provider.id, runAt: new Date().toISOString(), results, newSlugs: upserted.inserted })
        .onConflictDoUpdate({
          target: serpQueries.query,
          set: {
            provider: provider.id,
            runAt: sql`excluded.run_at`,
            results: sql`excluded.results`,
            newSlugs: sql`excluded.new_slugs`,
          },
        });
      console.log(`  ${query}: ${results} results, ${refs.length} boards, ${upserted.inserted} new`);
    },
  });

  console.log(
    `\nQueries used: ${result.queriesRun}/${maxQueries} (skipped ${result.skippedRecent} run in the last 30 days)`,
  );
  console.log(`Results: ${result.results}; unique boards: ${result.refs.length}; new companies: ${newSlugs}`);
  console.log(`New slugs per query: ${result.queriesRun ? (newSlugs / result.queriesRun).toFixed(2) : "0"}`);
  for (const error of result.errors) console.error(`  error: ${error}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
