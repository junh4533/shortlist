"use server";

/** Server Actions: persist application status (and copy it onto duplicate listings). */

import { and, eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/lib/constants";
import { getCurrentUserId } from "@/lib/current-user";
import { getDb, withBusyRetry } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { duplicateOverrides, jobs, jobTracking } from "@/lib/db/schema";
import { orderedPair } from "@/lib/jobs/duplicates";
import { listingCollapseKey } from "@/lib/url";

async function invalidateJobs() {
  revalidateTag(`jobs:${await getCurrentUserId()}`, "max");
  revalidatePath("/jobs", "layout");
}

function isStatus(value: string): value is ApplicationStatus {
  return APPLICATION_STATUSES.includes(value as ApplicationStatus);
}

/** Upsert status; also write the same status onto same-ATS title+location twins. */
export async function updateJobStatus(input: {
  atsProvider: string;
  boardSlug: string;
  externalId: string;
  status: string;
}) {
  const atsProvider = input.atsProvider.trim();
  const boardSlug = input.boardSlug.trim();
  const externalId = input.externalId.trim();
  if (!atsProvider || !boardSlug || !externalId) return;
  if (!isStatus(input.status)) return;
  const status = input.status;
  const userId = await getCurrentUserId();
  await rateLimit(userId, "write", 60, 60_000);
  const db = getDb();
  const updatedAt = new Date().toISOString();
  const [source] = await db
    .select({
      atsProvider: jobs.atsProvider,
      boardSlug: jobs.boardSlug,
      externalId: jobs.externalId,
      title: jobs.title,
      location: jobs.location,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.atsProvider, atsProvider),
        eq(jobs.boardSlug, boardSlug),
        eq(jobs.externalId, externalId),
      ),
    )
    .limit(1);

  const targets = source
    ? (
        await db
          .select({
            atsProvider: jobs.atsProvider,
            boardSlug: jobs.boardSlug,
            externalId: jobs.externalId,
            title: jobs.title,
            location: jobs.location,
          })
          .from(jobs)
          .where(
            and(eq(jobs.atsProvider, source.atsProvider), eq(jobs.title, source.title)),
          )
      ).filter((row) => listingCollapseKey(row) === listingCollapseKey(source))
    : [{ atsProvider, boardSlug, externalId }];

  await withBusyRetry(() =>
    db.transaction(async (tx) => {
      for (const row of targets) {
        await tx
          .insert(jobTracking)
          .values({
            userId,
            atsProvider: row.atsProvider,
            boardSlug: row.boardSlug,
            externalId: row.externalId,
            status,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: [
              jobTracking.userId,
              jobTracking.atsProvider,
              jobTracking.boardSlug,
              jobTracking.externalId,
            ],
            set: { status, updatedAt },
          });
      }
    }),
  );

  // Tag only. The status control refreshes the page after the row's exit animation.
  revalidateTag(`jobs:${userId}`, "max");
}

async function saveOverride(jobKeyA: string, jobKeyB: string, verdict: "same" | "different") {
  if (!jobKeyA || !jobKeyB || jobKeyA === jobKeyB) return;
  const userId = await getCurrentUserId();
  await rateLimit(userId, "write", 60, 60_000);
  const [a, b] = orderedPair(jobKeyA, jobKeyB);
  // "different" detaches the second key of the stored pair, so keep the caller's primary first.
  const [first, second] = verdict === "different" ? [jobKeyA, jobKeyB] : [a, b];
  await withBusyRetry(() =>
    getDb()
      .insert(duplicateOverrides)
      .values({ userId, jobKeyA: first, jobKeyB: second, verdict, createdAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: [duplicateOverrides.userId, duplicateOverrides.jobKeyA, duplicateOverrides.jobKeyB],
        set: { verdict, createdAt: new Date().toISOString() },
      }),
  );
}

/** "Not the same job": the form button value is "<primaryKey>~<memberKey>". */
export async function markNotDuplicate(formData: FormData) {
  const [primary, member] = String(formData.get("pair") ?? "").split("~");
  await saveOverride(primary ?? "", member ?? "", "different");
  await invalidateJobs();
}

/** "Same job": every checked row is merged into the first checked row's group. */
export async function markDuplicate(formData: FormData) {
  const keys = [...new Set(formData.getAll("merge").map(String).filter(Boolean))];
  for (const key of keys.slice(1)) await saveOverride(keys[0], key, "same");
  await invalidateJobs();
}

export async function clearJobStatus(formData: FormData) {
  const atsProvider = String(formData.get("atsProvider") ?? "");
  const boardSlug = String(formData.get("boardSlug") ?? "");
  const externalId = String(formData.get("externalId") ?? "");
  if (!atsProvider || !boardSlug || !externalId) return;

  const userId = await getCurrentUserId();
  await withBusyRetry(() =>
    getDb()
      .delete(jobTracking)
      .where(
        and(
          eq(jobTracking.userId, userId),
          eq(jobTracking.atsProvider, atsProvider),
          eq(jobTracking.boardSlug, boardSlug),
          eq(jobTracking.externalId, externalId),
        ),
      ),
  );
  await invalidateJobs();
}
