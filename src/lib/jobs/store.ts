/** Write one fetched board into jobs: storage filters, derived columns, diff-only upserts, and closed_at. */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FetchedJob } from "../ats/types";
import { getDb, withBusyRetry } from "../db";
import { companies, jobs } from "../db/schema";
import { jobCollapseKey, normalizeJobUrl } from "../url";
import { deriveJobFields } from "./derive";

type Company = typeof companies.$inferSelect;

export type StoreOptions = {
  storable: (title: string) => boolean;
  usOnly: boolean;
  checkedAt: string;
};

export type StoreResult = { written: number; unchanged: number; closed: number; skipped: number };

/** true if any job has a US signal, false if every job is explicitly non-US, else null. */
export function boardUsRelevance(fetched: FetchedJob[]): boolean | null {
  if (!fetched.length) return null;
  const signals = fetched.map((job) => deriveJobFields(job).isUs);
  if (signals.some((signal) => signal === true)) return true;
  return signals.every((signal) => signal === false) ? false : null;
}

export async function storeBoardJobs(
  company: Company,
  fetched: FetchedJob[],
  options: StoreOptions,
): Promise<StoreResult> {
  const db = getDb();
  const result: StoreResult = { written: 0, unchanged: 0, closed: 0, skipped: 0 };
  const prepared = fetched.flatMap((job) => {
    const url = normalizeJobUrl(job.url);
    const derived = deriveJobFields({ ...job, url });
    if (!options.storable(job.title) || (options.usOnly && derived.isUs === false)) {
      result.skipped += 1;
      return [];
    }
    return [{ job, url, derived }];
  });
  const seenIds = new Set(fetched.map((job) => job.externalId));

  await withBusyRetry(() =>
    db.transaction(async (tx) => {
      const boardWhere = and(
        eq(jobs.atsProvider, company.atsProvider),
        eq(jobs.boardSlug, company.slug),
      );
      const existing = await tx
        .select({
          externalId: jobs.externalId,
          contentHash: jobs.contentHash,
          closedAt: jobs.closedAt,
        })
        .from(jobs)
        .where(boardWhere);
      const byId = new Map(existing.map((row) => [row.externalId, row]));

      for (const { job, url, derived } of prepared) {
        const fields = {
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
          fetchedAt: options.checkedAt,
          ...derived,
          closedAt: null,
        };
        const keyWhere = and(boardWhere, eq(jobs.externalId, job.externalId));
        const current = byId.get(job.externalId);

        if (current) {
          if (current.contentHash === derived.contentHash) {
            if (current.closedAt) await tx.update(jobs).set({ closedAt: null }).where(keyWhere);
            result.unchanged += 1;
          } else {
            await tx.update(jobs).set(fields).where(keyWhere);
            result.written += 1;
          }
          continue;
        }

        // Same posting already stored under another key (URL alias): update it instead of inserting a twin.
        const identity = jobCollapseKey({ url, atsProvider: company.atsProvider, externalId: job.externalId });
        const [twin] = url
          ? (await tx.select().from(jobs).where(eq(jobs.url, url)).limit(5)).filter(
              (row) => row.atsProvider === company.atsProvider && jobCollapseKey(row) === identity,
            )
          : [];
        if (twin) {
          await tx
            .update(jobs)
            .set(fields)
            .where(
              and(
                eq(jobs.atsProvider, twin.atsProvider),
                eq(jobs.boardSlug, twin.boardSlug),
                eq(jobs.externalId, twin.externalId),
              ),
            );
          result.written += 1;
          continue;
        }

        await tx
          .insert(jobs)
          .values({
            atsProvider: company.atsProvider,
            boardSlug: company.slug,
            externalId: job.externalId,
            firstSeenAt: options.checkedAt,
            ...fields,
          })
          .onConflictDoUpdate({
            target: [jobs.atsProvider, jobs.boardSlug, jobs.externalId],
            set: fields,
          });
        result.written += 1;
      }

      const gone = existing
        .filter((row) => !row.closedAt && !seenIds.has(row.externalId))
        .map((row) => row.externalId);
      for (let index = 0; index < gone.length; index += 500) {
        await tx
          .update(jobs)
          .set({ closedAt: options.checkedAt })
          .where(and(boardWhere, inArray(jobs.externalId, gone.slice(index, index + 500))));
      }
      result.closed = gone.length;
    }),
  );
  return result;
}

/** Fill derived columns for rows stored before migration 0003 (idempotent). */
export async function backfillDerivedFields(log?: (line: string) => void) {
  const db = getDb();
  let total = 0;
  for (;;) {
    const rows = await db
      .select({
        atsProvider: jobs.atsProvider,
        boardSlug: jobs.boardSlug,
        externalId: jobs.externalId,
        title: jobs.title,
        location: jobs.location,
        cleanText: jobs.cleanText,
        url: jobs.url,
        salaryMin: jobs.salaryMin,
        salaryMax: jobs.salaryMax,
        postedAt: jobs.postedAt,
        updatedAt: jobs.updatedAt,
        fetchedAt: jobs.fetchedAt,
      })
      .from(jobs)
      .where(isNull(jobs.titleNorm))
      .limit(1000);
    if (!rows.length) break;
    await withBusyRetry(() =>
      db.transaction(async (tx) => {
        for (const row of rows) {
          await tx
            .update(jobs)
            .set({ ...deriveJobFields(row), firstSeenAt: row.fetchedAt })
            .where(
              and(
                eq(jobs.atsProvider, row.atsProvider),
                eq(jobs.boardSlug, row.boardSlug),
                eq(jobs.externalId, row.externalId),
              ),
            );
        }
      }),
    );
    total += rows.length;
    log?.(`Backfilled derived fields for ${total} jobs`);
  }
  return total;
}
