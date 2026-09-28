/** CLI: import company slugs, then fetch ATS boards into SQLite (`npm run ingest`). */
import { and, eq, sql } from "drizzle-orm";
import {
  loadDefaultPreferences,
  loadSystemConfig,
  type AtsProvider,
} from "../src/lib/config";
import { readAllCompanySources } from "../src/lib/csv";
import { getDb, migrate, withBusyRetry } from "../src/lib/db";
import { companies, jobs } from "../src/lib/db/schema";
import { fetchBoard, type FetchedJob } from "../src/lib/ats";
import { createMutex, mapPool, sleep } from "../src/lib/concurrency";
import { titleMatches } from "../src/lib/match";
import { jobCollapseKey, normalizeJobUrl } from "../src/lib/url";

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

/** Upsert CSV/JSON slugs into companies (unknown until ingest checks the live API). */
async function importCompanies() {
  const config = loadSystemConfig();
  const db = getDb();
  const allowed = new Set(config.ingest.providers);
  let inserted = 0;
  let seen = 0;

  type CompanyInsert = {
    atsProvider: AtsProvider;
    slug: string;
    name: string;
    status: string;
    lastCrawled: string | null;
  };

  async function insertBatch(rows: CompanyInsert[]) {
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const [existing] = await tx
          .select()
          .from(companies)
          .where(
            and(
              eq(companies.atsProvider, row.atsProvider),
              eq(companies.slug, row.slug),
            ),
          )
          .limit(1);

        if (existing) {
          const keepName =
            existing.name && existing.name !== existing.slug
              ? existing.name
              : row.name;
          await tx
            .update(companies)
            .set({
              name: keepName,
              lastCrawled: row.lastCrawled ?? existing.lastCrawled,
            })
            .where(
              and(
                eq(companies.atsProvider, row.atsProvider),
                eq(companies.slug, row.slug),
              ),
            );
          continue;
        }

        await tx.insert(companies).values(row);
        inserted += 1;
      }
    });
  }

  const batch: CompanyInsert[] = [];
  for await (const row of readAllCompanySources(config.ingest.providers, process.cwd())) {
    if (!allowed.has(row.atsProvider)) continue;
    seen += 1;
    batch.push({
      atsProvider: row.atsProvider,
      slug: row.slug,
      name: row.name,
      status: "unknown",
      lastCrawled: row.lastCrawled,
    });
    if (batch.length >= 500) await insertBatch(batch.splice(0, batch.length));
  }
  if (batch.length) await insertBatch(batch);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(companies);
  console.log(
    `Read ${seen} source rows; ${inserted} new companies; ${total} total in database`,
  );
}

type Company = typeof companies.$inferSelect;

/** Store one board's jobs in a single transaction; returns how many rows were written. */
async function storeBoardJobs(
  company: Company,
  fetched: FetchedJob[],
  checkedAt: string,
) {
  const db = getDb();
  let stored = 0;
  await db.transaction(async (tx) => {
    for (const job of fetched) {
      const url = normalizeJobUrl(job.url);
      const identity = jobCollapseKey({
        url,
        atsProvider: company.atsProvider,
        externalId: job.externalId,
      });
      const fields = {
        title: job.title,
        department: job.department,
        location: job.location,
        cleanText: job.cleanText,
        url,
        isRemote: job.isRemote,
        workplaceType: job.workplaceType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryUnknown: job.salaryUnknown,
        postedAt: job.postedAt,
        updatedAt: job.updatedAt,
        fetchedAt: checkedAt,
      };

      // If this posting is already stored under another key (same URL / collapse
      // key), update that row instead of inserting a twin.
      const [existingByUrl] = url
        ? await tx.select().from(jobs).where(eq(jobs.url, url)).limit(1)
        : [];
      const existingById = existingByUrl
        ? undefined
        : (
            await tx
              .select()
              .from(jobs)
              .where(
                and(
                  eq(jobs.atsProvider, company.atsProvider),
                  eq(jobs.externalId, job.externalId),
                ),
              )
          ).find(
            (row) =>
              row.boardSlug.toLowerCase() === company.slug.toLowerCase() ||
              jobCollapseKey(row) === identity,
          );
      const existing = existingByUrl ?? existingById;
      if (
        existing &&
        (existing.atsProvider !== company.atsProvider ||
          existing.boardSlug !== company.slug ||
          existing.externalId !== job.externalId)
      ) {
        await tx
          .update(jobs)
          .set(fields)
          .where(
            and(
              eq(jobs.atsProvider, existing.atsProvider),
              eq(jobs.boardSlug, existing.boardSlug),
              eq(jobs.externalId, existing.externalId),
            ),
          );
        stored += 1;
        continue;
      }

      await tx
        .insert(jobs)
        .values({
          atsProvider: company.atsProvider,
          boardSlug: company.slug,
          externalId: job.externalId,
          companyName: company.name,
          ...fields,
        })
        .onConflictDoUpdate({
          target: [jobs.atsProvider, jobs.boardSlug, jobs.externalId],
          set: { companyName: company.name, ...fields },
        });
      stored += 1;
    }
  });
  return stored;
}

/** Fetch boards (unknown/error unless --force), mark live/dead, store title-matching jobs. */
async function ingestBoards() {
  const config = loadSystemConfig();
  const preferences = loadDefaultPreferences();
  const db = getDb();
  const limit = argValue("--limit") ? Number(argValue("--limit")) : undefined;
  const providerFilter = argValue("--provider") as AtsProvider | undefined;
  const verifyOnly = hasFlag("--verify-only");
  const writeLock = createMutex();

  let rows = await db.select().from(companies);
  rows = rows.filter((row) =>
    config.ingest.providers.includes(row.atsProvider as AtsProvider),
  );
  if (providerFilter) {
    rows = rows.filter((row) => row.atsProvider === providerFilter);
  }
  if (!hasFlag("--force") && !hasFlag("--recheck")) {
    rows = rows.filter(
      (row) => row.status === "unknown" || row.status === "error",
    );
  }
  if (limit && Number.isFinite(limit)) {
    rows = rows.slice(0, limit);
  }

  let live = 0;
  let dead = 0;
  let errors = 0;
  let storedJobs = 0;

  await mapPool(rows, config.ingest.concurrency, async (company, index) => {
    const result = await fetchBoard(
      company.atsProvider as AtsProvider,
      company.slug,
      config.ingest.user_agent,
    );
    const checkedAt = new Date().toISOString();
    const companyWhere = and(
      eq(companies.atsProvider, company.atsProvider),
      eq(companies.slug, company.slug),
    );

    if (!result.ok) {
      const status = result.reason === "dead" ? "dead" : "error";
      if (status === "dead") dead += 1;
      else errors += 1;
      await writeLock(() =>
        withBusyRetry(() =>
          db.update(companies).set({ status, lastChecked: checkedAt }).where(companyWhere),
        ),
      );
    } else {
      live += 1;
      const matching = verifyOnly
        ? []
        : result.jobs.filter((job) => titleMatches(job.title, preferences));
      await writeLock(async () => {
        await withBusyRetry(() =>
          db
            .update(companies)
            .set({ status: "live", lastChecked: checkedAt })
            .where(companyWhere),
        );
        if (matching.length) {
          storedJobs += await withBusyRetry(() =>
            storeBoardJobs(company, matching, checkedAt),
          );
        }
      });
    }

    if ((index + 1) % 10 === 0 || index + 1 === rows.length) {
      console.log(
        `${index + 1}/${rows.length} boards  live=${live} dead=${dead} errors=${errors} jobs=${storedJobs}`,
      );
    }
    await sleep(config.ingest.polite_delay_ms);
  });
  console.log(
    `Done: ${rows.length} boards  live=${live} dead=${dead} errors=${errors} jobs=${storedJobs}`,
  );
}

async function main() {
  if (hasFlag("--help")) {
    console.log(`Usage:
  npm run import-companies
  npm run ingest
  npm run ingest -- --limit 50
  npm run ingest -- --verify-only --limit 100
  npm run ingest -- --provider greenhouse --limit 20
  npm run ingest -- --force          # re-check already live/dead boards`);
    return;
  }

  await migrate();
  if (hasFlag("--import-only") || hasFlag("--import-companies")) {
    await importCompanies();
    return;
  }

  await importCompanies();
  await ingestBoards();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
