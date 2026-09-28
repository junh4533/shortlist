/** Recompute company keys and likely-duplicate groups for all open jobs (runs at the end of ingest). */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, withBusyRetry } from "../db";
import { companies, jobs } from "../db/schema";
import { companyIdentity, companyKey, groupJobs, jobKey, type GroupableJob } from "./duplicates";

export async function regroupDuplicates(log?: (line: string) => void) {
  const db = getDb();
  const companyRows = await db
    .select({
      atsProvider: companies.atsProvider,
      slug: companies.slug,
      name: companies.name,
      website: companies.website,
      companyKey: companies.companyKey,
      companyKeyConfidence: companies.companyKeyConfidence,
    })
    .from(companies);

  const identities = new Map<string, ReturnType<typeof companyIdentity>>();
  const keyUpdates: { atsProvider: string; slug: string; key: string; confidence: string }[] = [];
  for (const company of companyRows) {
    identities.set(`${company.atsProvider}|${company.slug}`, companyIdentity(company));
    const { key, confidence } = companyKey(company);
    if (key !== company.companyKey || confidence !== company.companyKeyConfidence) {
      keyUpdates.push({ atsProvider: company.atsProvider, slug: company.slug, key, confidence });
    }
  }
  for (let index = 0; index < keyUpdates.length; index += 1000) {
    const slice = keyUpdates.slice(index, index + 1000);
    await withBusyRetry(() =>
      db.transaction(async (tx) => {
        for (const update of slice) {
          await tx
            .update(companies)
            .set({ companyKey: update.key, companyKeyConfidence: update.confidence })
            .where(and(eq(companies.atsProvider, update.atsProvider), eq(companies.slug, update.slug)));
        }
      }),
    );
  }

  const openJobs = await db
    .select({
      atsProvider: jobs.atsProvider,
      boardSlug: jobs.boardSlug,
      externalId: jobs.externalId,
      title: jobs.title,
      location: jobs.location,
      isRemote: jobs.isRemote,
      workplaceType: jobs.workplaceType,
      dupGroupId: jobs.dupGroupId,
      dupConfidence: jobs.dupConfidence,
      dupReason: jobs.dupReason,
    })
    .from(jobs)
    .where(isNull(jobs.closedAt));

  const groupable: GroupableJob[] = openJobs.flatMap((row) => {
    const company = identities.get(`${row.atsProvider}|${row.boardSlug}`);
    return company ? [{ ...row, key: jobKey(row), company }] : [];
  });
  const assignments = groupJobs(groupable);

  const changed = openJobs.filter((row) => {
    const next = assignments.get(jobKey(row));
    return (
      (next?.groupId ?? null) !== row.dupGroupId ||
      (next?.confidence ?? null) !== row.dupConfidence ||
      (next?.reason ?? null) !== row.dupReason
    );
  });
  for (let index = 0; index < changed.length; index += 1000) {
    const slice = changed.slice(index, index + 1000);
    await withBusyRetry(() =>
      db.transaction(async (tx) => {
        for (const row of slice) {
          const next = assignments.get(jobKey(row));
          await tx
            .update(jobs)
            .set({
              dupGroupId: next?.groupId ?? null,
              dupConfidence: next?.confidence ?? null,
              dupReason: next?.reason ?? null,
            })
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
  }

  // Closed jobs keep no group.
  await db
    .update(jobs)
    .set({ dupGroupId: null, dupConfidence: null, dupReason: null })
    .where(and(isNotNull(jobs.closedAt), isNotNull(jobs.dupGroupId)));

  const groups = new Set([...assignments.values()].map((assignment) => assignment.groupId)).size;
  log?.(
    `Duplicate groups: ${groups} groups covering ${assignments.size} jobs (${changed.length} rows updated, ${keyUpdates.length} company keys updated)`,
  );
  return { groups, jobs: assignments.size };
}
