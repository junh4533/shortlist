/** CLI: import company slugs, then fetch ATS boards into SQLite (`npm run ingest`). */
import { and, eq, sql } from "drizzle-orm";
import { fetchBoard } from "../src/lib/ats";
import { loadSystemConfig, providerLimits, type AtsProvider } from "../src/lib/config";
import { createMutex, mapPool, sleep } from "../src/lib/concurrency";
import { getDb, migrate, withBusyRetry } from "../src/lib/db";
import { companies } from "../src/lib/db/schema";
import { makeTitleAllowlist } from "../src/lib/jobs/store-filter";
import { regroupDuplicates } from "../src/lib/jobs/regroup";
import { backfillDerivedFields, boardUsRelevance, storeBoardJobs } from "../src/lib/jobs/store";
import { importAllSources } from "../src/lib/sources/import";

type Company = typeof companies.$inferSelect;

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

/** Upsert every dataset's slugs into companies (unknown until ingest checks the live API). */
async function importCompanies() {
  await importAllSources({
    providers: loadSystemConfig().ingest.providers,
    log: (line) => console.log(line),
  });
  const [{ total }] = await getDb()
    .select({ total: sql<number>`count(*)` })
    .from(companies);
  console.log(`${total} companies in database`);
}

/** Pick which boards to fetch this run. */
function selectBoards(rows: Company[], providers: readonly AtsProvider[]) {
  const force = hasFlag("--force") || hasFlag("--recheck");
  const providerFilter = argValue("--provider");
  const limit = argValue("--limit") ? Number(argValue("--limit")) : undefined;
  let selected = rows.filter((row) => providers.includes(row.atsProvider as AtsProvider));
  if (providerFilter) selected = selected.filter((row) => row.atsProvider === providerFilter);
  if (force) {
    // Forced refreshes re-check live boards, skipping boards known to have no US jobs.
    selected = selected.filter(
      (row) =>
        (hasFlag("--include-dead") || row.status !== "dead") &&
        (hasFlag("--include-non-us") || row.usRelevant !== false),
    );
  } else {
    selected = selected.filter((row) => row.status === "unknown" || row.status === "error");
  }
  if (hasFlag("--resume")) {
    const hours = Number(argValue("--resume-hours") ?? 24);
    const cutoff = Date.now() - (Number.isFinite(hours) ? hours : 24) * 3_600_000;
    const before = selected.length;
    selected = selected.filter((row) => {
      const checked = Date.parse(row.lastChecked ?? "");
      return !Number.isFinite(checked) || checked < cutoff;
    });
    console.log(
      `Resume: skipping ${before - selected.length} boards checked in the last ${hours}h; ${selected.length} left`,
    );
  }
  if (limit && Number.isFinite(limit)) selected = selected.slice(0, limit);
  return selected;
}

/** Fetch boards, mark live/dead, store allowlisted US jobs with diff-only writes. */
async function ingestBoards() {
  const config = loadSystemConfig();
  const db = getDb();
  const verifyOnly = hasFlag("--verify-only");
  const writeLock = createMutex();
  const storable = makeTitleAllowlist(config.ingest.store_title_allowlist);
  const rows = selectBoards(await db.select().from(companies), config.ingest.providers);

  const totals = { live: 0, dead: 0, errors: 0, written: 0, unchanged: 0, closed: 0 };
  let processed = 0;

  async function processBoard(company: Company) {
    const result = await fetchBoard(company.atsProvider as AtsProvider, company.slug, {
      userAgent: config.ingest.user_agent,
      withDetails: (title) => !verifyOnly && storable(title),
      previouslyLive: company.status === "live",
    });
    const checkedAt = new Date().toISOString();
    const companyWhere = and(
      eq(companies.atsProvider, company.atsProvider),
      eq(companies.slug, company.slug),
    );

    await writeLock(async () => {
      if (!result.ok) {
        const status = result.reason === "dead" ? "dead" : "error";
        if (status === "dead") totals.dead += 1;
        else totals.errors += 1;
        await withBusyRetry(() =>
          db.update(companies).set({ status, lastChecked: checkedAt }).where(companyWhere),
        );
        return;
      }
      totals.live += 1;
      await withBusyRetry(() =>
        db
          .update(companies)
          .set({
            status: "live",
            lastChecked: checkedAt,
            lastJobCount: result.jobs.length,
            usRelevant: boardUsRelevance(result.jobs),
          })
          .where(companyWhere),
      );
      if (verifyOnly) return;
      const stored = await storeBoardJobs(company, result.jobs, {
        storable,
        usOnly: config.ingest.us_only,
        checkedAt,
      });
      totals.written += stored.written;
      totals.unchanged += stored.unchanged;
      totals.closed += stored.closed;
    });

    processed += 1;
    if (processed % 10 === 0) {
      console.log(
        `${processed}/${rows.length} boards  live=${totals.live} dead=${totals.dead} errors=${totals.errors} written=${totals.written} unchanged=${totals.unchanged} closed=${totals.closed}`,
      );
    }
  }

  const byProvider = new Map<AtsProvider, Company[]>();
  for (const row of rows) {
    const provider = row.atsProvider as AtsProvider;
    byProvider.set(provider, [...(byProvider.get(provider) ?? []), row]);
  }
  await Promise.all(
    [...byProvider].map(([provider, boards]) => {
      const { concurrency, delayMs } = providerLimits(config, provider);
      return mapPool(boards, concurrency, async (company) => {
        await processBoard(company);
        await sleep(delayMs);
      });
    }),
  );
  console.log(
    `Done: ${rows.length} boards  live=${totals.live} dead=${totals.dead} errors=${totals.errors} written=${totals.written} unchanged=${totals.unchanged} closed=${totals.closed}`,
  );
}

async function main() {
  if (hasFlag("--help")) {
    console.log(`Usage:
  npm run ingest                      # import datasets, fetch unknown/error boards
  npm run ingest -- --limit 50
  npm run ingest -- --verify-only --limit 100
  npm run ingest -- --provider greenhouse --limit 20
  npm run ingest -- --force           # re-check live boards (skips boards with no US jobs)
  npm run ingest -- --force --resume  # continue a stopped --force run (skips boards checked in the last 24h)
  npm run ingest -- --force --resume --resume-hours 48
  npm run ingest -- --force --include-non-us --include-dead
  npm run ingest -- --skip-import     # do not re-read datasets first
  npm run ingest -- --no-group        # skip duplicate grouping at the end`);
    return;
  }

  await migrate();
  await backfillDerivedFields((line) => console.log(line));
  if (hasFlag("--import-only") || hasFlag("--import-companies")) {
    await importCompanies();
    return;
  }
  if (!hasFlag("--skip-import")) await importCompanies();
  await ingestBoards();
  if (!hasFlag("--no-group") && !hasFlag("--verify-only")) {
    await regroupDuplicates((line) => console.log(line));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
