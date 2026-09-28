/** Remove job rows that are the same posting under two keys (URL aliases), keeping tracking on the survivor. */
import { and, eq } from "drizzle-orm";
import { jobCollapseKey, normalizeJobUrl } from "../url";
import { getDb } from "./client";
import { jobs, jobTracking } from "./schema";

type JobKeyRow = {
  url: string;
  atsProvider: string;
  boardSlug: string;
  externalId: string;
  companyName: string;
  fetchedAt: string;
};

function jobKeyWhere(row: Pick<JobKeyRow, "atsProvider" | "boardSlug" | "externalId">) {
  return and(
    eq(jobs.atsProvider, row.atsProvider),
    eq(jobs.boardSlug, row.boardSlug),
    eq(jobs.externalId, row.externalId),
  );
}

function trackingKeyWhere(row: Pick<JobKeyRow, "atsProvider" | "boardSlug" | "externalId">) {
  return and(
    eq(jobTracking.userId, "local"),
    eq(jobTracking.atsProvider, row.atsProvider),
    eq(jobTracking.boardSlug, row.boardSlug),
    eq(jobTracking.externalId, row.externalId),
  );
}

function hasRealName(row: JobKeyRow) {
  return row.companyName.toLowerCase() === row.boardSlug.toLowerCase() ? 0 : 1;
}

/** Group by jobCollapseKey, keep the best row, move tracking onto the survivor, delete extras. */
export async function dedupeJobsByUrl() {
  const db = getDb();
  const rows: JobKeyRow[] = await db
    .select({
      url: jobs.url,
      atsProvider: jobs.atsProvider,
      boardSlug: jobs.boardSlug,
      externalId: jobs.externalId,
      companyName: jobs.companyName,
      fetchedAt: jobs.fetchedAt,
    })
    .from(jobs);

  const groups = new Map<string, JobKeyRow[]>();
  for (const row of rows) {
    const key = jobCollapseKey(row);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  let removed = 0;
  await db.transaction(async (tx) => {
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      group.sort(
        (left, right) =>
          hasRealName(right) - hasRealName(left) ||
          String(right.fetchedAt).localeCompare(String(left.fetchedAt)),
      );
      const [keep, ...extras] = group;
      const normalized = normalizeJobUrl(keep.url);
      if (normalized && keep.url !== normalized) {
        await tx.update(jobs).set({ url: normalized }).where(jobKeyWhere(keep));
      }
      const keepTracking = await tx
        .select()
        .from(jobTracking)
        .where(trackingKeyWhere(keep))
        .limit(1);
      let keepHasTracking = keepTracking.length > 0;
      for (const extra of extras) {
        if (!keepHasTracking) {
          const [extraTracking] = await tx
            .select()
            .from(jobTracking)
            .where(trackingKeyWhere(extra))
            .limit(1);
          if (extraTracking) {
            await tx.insert(jobTracking).values({
              ...extraTracking,
              userId: "local",
              atsProvider: keep.atsProvider,
              boardSlug: keep.boardSlug,
              externalId: keep.externalId,
            });
            keepHasTracking = true;
          }
        }
        await tx.delete(jobTracking).where(trackingKeyWhere(extra));
        await tx.delete(jobs).where(jobKeyWhere(extra));
        removed += 1;
      }
    }
  });
  return removed;
}
