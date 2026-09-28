"use server";

/** Server Actions: persist application status (and copy it onto duplicate listings). */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/lib/constants";
import { getDb, withBusyRetry } from "@/lib/db";
import { jobs, jobTracking } from "@/lib/db/schema";
import { listingCollapseKey } from "@/lib/url";

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
            atsProvider: row.atsProvider,
            boardSlug: row.boardSlug,
            externalId: row.externalId,
            status,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: [
              jobTracking.atsProvider,
              jobTracking.boardSlug,
              jobTracking.externalId,
            ],
            set: { status, updatedAt },
          });
      }
    }),
  );

  revalidatePath("/", "layout");
}

export async function clearJobStatus(formData: FormData) {
  const atsProvider = String(formData.get("atsProvider") ?? "");
  const boardSlug = String(formData.get("boardSlug") ?? "");
  const externalId = String(formData.get("externalId") ?? "");
  if (!atsProvider || !boardSlug || !externalId) return;

  await withBusyRetry(() =>
    getDb()
      .delete(jobTracking)
      .where(
        and(
          eq(jobTracking.atsProvider, atsProvider),
          eq(jobTracking.boardSlug, boardSlug),
          eq(jobTracking.externalId, externalId),
        ),
      ),
  );
  revalidatePath("/", "layout");
}
