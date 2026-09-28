/** CLI: one-time merge of companies whose slugs differ only by case/whitespace/encoding (`npm run migrate-normalize-slugs -- --dry-run`). */
import { and, eq, sql } from "drizzle-orm";
import { isAtsProvider } from "../src/lib/ats/providers";
import { statusPriority } from "../src/lib/constants";
import { getDb, migrate, withBusyRetry, type Db } from "../src/lib/db";
import { companies, companySources, jobs, jobTracking } from "../src/lib/db/schema";
import { normalizeSlug } from "../src/lib/slug";
import { backupDb } from "./backup-db";

type Company = typeof companies.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const STATUS_RANK: Record<string, number> = { live: 3, unknown: 2, error: 1, dead: 0 };

/** live > unknown > error > dead, then a real name, then the most recent check. */
function pickSurvivor(members: Company[]) {
  return [...members].sort(
    (left, right) =>
      (STATUS_RANK[right.status] ?? 0) - (STATUS_RANK[left.status] ?? 0) ||
      Number(right.name !== right.slug) - Number(left.name !== left.slug) ||
      String(right.lastChecked ?? "").localeCompare(String(left.lastChecked ?? "")),
  )[0];
}

async function countRows() {
  const db = getDb();
  const [[c], [j], [t]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(companies),
    db.select({ n: sql<number>`count(*)` }).from(jobs),
    db.select({ n: sql<number>`count(*)` }).from(jobTracking),
  ]);
  return { companies: c.n, jobs: j.n, tracking: t.n };
}

/** Move one board's jobs and tracking rows onto `target`, resolving key collisions. */
async function moveBoard(
  tx: Tx,
  provider: string,
  fromSlug: string,
  target: string,
) {
  const fromJobs = await tx
    .select()
    .from(jobs)
    .where(and(eq(jobs.atsProvider, provider), eq(jobs.boardSlug, fromSlug)));
  for (const job of fromJobs) {
    const [existing] = await tx
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.atsProvider, provider),
          eq(jobs.boardSlug, target),
          eq(jobs.externalId, job.externalId),
        ),
      )
      .limit(1);
    const fromWhere = and(
      eq(jobs.atsProvider, provider),
      eq(jobs.boardSlug, fromSlug),
      eq(jobs.externalId, job.externalId),
    );
    if (existing) {
      if (String(job.fetchedAt) > String(existing.fetchedAt)) {
        await tx
          .delete(jobs)
          .where(
            and(
              eq(jobs.atsProvider, provider),
              eq(jobs.boardSlug, target),
              eq(jobs.externalId, job.externalId),
            ),
          );
        await tx.update(jobs).set({ boardSlug: target }).where(fromWhere);
      } else {
        await tx.delete(jobs).where(fromWhere);
      }
    } else {
      await tx.update(jobs).set({ boardSlug: target }).where(fromWhere);
    }
  }

  const fromTracking = await tx
    .select()
    .from(jobTracking)
    .where(and(eq(jobTracking.atsProvider, provider), eq(jobTracking.boardSlug, fromSlug)));
  for (const row of fromTracking) {
    const targetWhere = and(
      eq(jobTracking.atsProvider, provider),
      eq(jobTracking.boardSlug, target),
      eq(jobTracking.externalId, row.externalId),
    );
    const fromWhere = and(
      eq(jobTracking.atsProvider, provider),
      eq(jobTracking.boardSlug, fromSlug),
      eq(jobTracking.externalId, row.externalId),
    );
    const [existing] = await tx.select().from(jobTracking).where(targetWhere).limit(1);
    if (existing) {
      if (statusPriority(row.status) > statusPriority(existing.status)) {
        await tx.delete(jobTracking).where(targetWhere);
        await tx.update(jobTracking).set({ boardSlug: target }).where(fromWhere);
      } else {
        await tx.delete(jobTracking).where(fromWhere);
      }
    } else {
      await tx.update(jobTracking).set({ boardSlug: target }).where(fromWhere);
    }
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await migrate();
  const db = getDb();
  const all = await db.select().from(companies);

  const groups = new Map<string, { provider: string; target: string; members: Company[] }>();
  const invalid: Company[] = [];
  for (const company of all) {
    const target = isAtsProvider(company.atsProvider)
      ? normalizeSlug(company.atsProvider, company.slug)
      : null;
    if (!target) {
      invalid.push(company);
      continue;
    }
    const key = `${company.atsProvider}:${target}`;
    const group = groups.get(key) ?? { provider: company.atsProvider, target, members: [] };
    group.members.push(company);
    groups.set(key, group);
  }

  const changes = [...groups.values()].filter(
    (group) => group.members.length > 1 || group.members[0].slug !== group.target,
  );
  const merges = changes.filter((group) => group.members.length > 1);
  console.log(
    `${all.length} companies; ${changes.length} need changes (${merges.length} merges, ${changes.length - merges.length} renames); ${invalid.length} invalid slugs left untouched`,
  );
  for (const group of changes.slice(0, 25)) {
    console.log(
      `  ${group.provider}  ${group.members.map((m) => JSON.stringify(m.slug)).join(" + ")} -> ${group.target}`,
    );
  }
  if (changes.length > 25) console.log(`  ... and ${changes.length - 25} more`);
  for (const company of invalid.slice(0, 10)) {
    console.log(`  invalid: ${company.atsProvider} ${JSON.stringify(company.slug)}`);
  }

  if (dryRun) return;

  await backupDb();
  const before = await countRows();

  for (const group of changes) {
    const survivor = pickSurvivor(group.members);
    await withBusyRetry(() =>
      db.transaction(async (tx) => {
        for (const member of group.members) {
          if (member.slug !== group.target) {
            await moveBoard(tx, group.provider, member.slug, group.target);
          }
        }
        for (const member of group.members) {
          if (member === survivor) continue;
          await tx
            .delete(companies)
            .where(
              and(eq(companies.atsProvider, group.provider), eq(companies.slug, member.slug)),
            );
        }
        if (survivor.slug !== group.target) {
          await tx
            .update(companies)
            .set({ slug: group.target })
            .where(
              and(eq(companies.atsProvider, group.provider), eq(companies.slug, survivor.slug)),
            );
        }
      }),
    );
  }

  const now = new Date().toISOString();
  await db.run(
    sql`INSERT OR IGNORE INTO ${companySources} (ats_provider, slug, source, first_seen, last_seen)
        SELECT ats_provider, slug, 'legacy', ${now}, ${now} FROM ${companies}`,
  );

  const after = await countRows();
  console.log(`Before: ${JSON.stringify(before)}`);
  console.log(`After:  ${JSON.stringify(after)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
