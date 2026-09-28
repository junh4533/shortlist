/** Cached job list per (user, preferences hash, ingest version, query params). Invalidated by tag on save/ingest/status change. */
import { unstable_cache } from "next/cache";
import { max } from "drizzle-orm";
import { getDb } from "../db";
import { jobs } from "../db/schema";
import { preferencesHash } from "../preferences-store";
import { listMatchedJobs, type ListOptions } from "./query";

/** Changes whenever ingest writes: the newest fetched_at timestamp. */
async function ingestVersion() {
  const [row] = await getDb().select({ version: max(jobs.fetchedAt) }).from(jobs);
  return row?.version ?? "empty";
}

export async function cachedMatchedJobs(options: ListOptions) {
  const version = await ingestVersion();
  const key = [
    options.userId,
    preferencesHash(options.preferences),
    version,
    JSON.stringify([options.q, options.status, options.sort, options.dir, options.page, options.grouped]),
  ];
  return unstable_cache(() => listMatchedJobs(options), key, {
    tags: [`jobs:${options.userId}`, "jobs"],
    revalidate: 3600,
  })();
}
