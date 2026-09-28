/** CLI: import company slugs, then fetch ATS boards into SQLite (`npm run ingest`). */
import { eq, and } from "drizzle-orm";
import { loadSearchConfig, type AtsProvider } from "../src/lib/config";
import { readAllCompanySources } from "../src/lib/csv";
import { getDb } from "../src/lib/db";
import { companies, jobs } from "../src/lib/db/schema";
import { fetchBoard, mapPool } from "../src/lib/ats";
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Upsert CSV/JSON slugs into companies (unknown until ingest checks the live API). */
async function importCompanies() {
  const config = loadSearchConfig();
  const { sqlite, db } = getDb();
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

  const insert = sqlite.transaction((rows: CompanyInsert[]) => {
    for (const row of rows) {
      const existing = db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.atsProvider, row.atsProvider),
            eq(companies.slug, row.slug),
          ),
        )
        .get();

      if (existing) {
        const keepName =
          existing.name && existing.name !== existing.slug
            ? existing.name
            : row.name;
        db.update(companies)
          .set({
            name: keepName,
            lastCrawled: row.lastCrawled ?? existing.lastCrawled,
          })
          .where(
            and(
              eq(companies.atsProvider, row.atsProvider),
              eq(companies.slug, row.slug),
            ),
          )
          .run();
        continue;
      }

      db.insert(companies).values(row).run();
      inserted += 1;
    }
  });

  const batch: CompanyInsert[] = [];

  for await (const row of readAllCompanySources(config, process.cwd())) {
    if (!allowed.has(row.atsProvider)) continue;
    seen += 1;
    batch.push({
      atsProvider: row.atsProvider,
      slug: row.slug,
      name: row.name,
      status: "unknown",
      lastCrawled: row.lastCrawled,
    });
    if (batch.length >= 500) {
      insert(batch.splice(0, batch.length));
    }
  }
  if (batch.length) insert(batch);
  const total = db.select().from(companies).all().length;
  sqlite.close();
  console.log(
    `Read ${seen} source rows; ${inserted} new companies; ${total} total in database`,
  );
}

/** Fetch boards (unknown/error unless --force), mark live/dead, store title-matching jobs. */
async function ingestBoards() {
  const config = loadSearchConfig();
  const { sqlite, db } = getDb();
  const limit = argValue("--limit") ? Number(argValue("--limit")) : undefined;
  const providerFilter = argValue("--provider") as AtsProvider | undefined;
  const verifyOnly = hasFlag("--verify-only");

  let rows = db.select().from(companies).all();
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

    if (!result.ok) {
      const status = result.reason === "dead" ? "dead" : "error";
      if (status === "dead") dead += 1;
      else errors += 1;
      db.update(companies)
        .set({ status, lastChecked: checkedAt })
        .where(
          and(
            eq(companies.atsProvider, company.atsProvider),
            eq(companies.slug, company.slug),
          ),
        )
        .run();
    } else {
      live += 1;
      db.update(companies)
        .set({
          status: "live",
          lastChecked: checkedAt,
        })
        .where(
          and(
            eq(companies.atsProvider, company.atsProvider),
            eq(companies.slug, company.slug),
          ),
        )
        .run();

      if (!verifyOnly) {
        // Only cache title matches. If we already stored this posting under another
        // key (same URL / collapse key), update that row instead of inserting a twin.
        for (const job of result.jobs) {
          if (!titleMatches(job.title, config)) continue;
          const url = normalizeJobUrl(job.url);
          const identity = jobCollapseKey({
            url,
            atsProvider: company.atsProvider,
            externalId: job.externalId,
          });
          const existingByUrl = url
            ? db.select().from(jobs).where(eq(jobs.url, url)).get()
            : undefined;
          const existingById = db
            .select()
            .from(jobs)
            .where(
              and(
                eq(jobs.atsProvider, company.atsProvider),
                eq(jobs.externalId, job.externalId),
              ),
            )
            .all()
            .find(
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
            db.update(jobs)
              .set({
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
              })
              .where(
                and(
                  eq(jobs.atsProvider, existing.atsProvider),
                  eq(jobs.boardSlug, existing.boardSlug),
                  eq(jobs.externalId, existing.externalId),
                ),
              )
              .run();
            storedJobs += 1;
            continue;
          }
          db.insert(jobs)
            .values({
              atsProvider: company.atsProvider,
              boardSlug: company.slug,
              externalId: job.externalId,
              companyName: company.name,
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
            })
            .onConflictDoUpdate({
              target: [jobs.atsProvider, jobs.boardSlug, jobs.externalId],
              set: {
                companyName: company.name,
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
              },
            })
            .run();
          storedJobs += 1;
        }
      }
    }

    if ((index + 1) % 10 === 0 || index + 1 === rows.length) {
      console.log(
        `${index + 1}/${rows.length} boards  live=${live} dead=${dead} errors=${errors} jobs=${storedJobs}`,
      );
    }
    await sleep(config.ingest.polite_delay_ms);
  });

  sqlite.close();
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
