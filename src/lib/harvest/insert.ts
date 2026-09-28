/** The only path for adding companies: normalize slugs, insert new boards as unknown, record every source. */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AtsProvider } from "../ats/providers";
import { getDb, withBusyRetry } from "../db";
import { companies, companySources } from "../db/schema";
import { companyWebsiteDomain } from "../crawl/domain";
import { normalizeSlug } from "../slug";

export type CompanyCandidate = {
  atsProvider: AtsProvider;
  slug: string;
  name?: string | null;
  website?: string | null;
  lastCrawled?: string | null;
};

export type UpsertResult = {
  seen: number;
  inserted: number;
  invalid: number;
  insertedRows: { atsProvider: AtsProvider; slug: string }[];
};

const BATCH_SIZE = 500;

type NormalizedCompany = {
  atsProvider: AtsProvider;
  slug: string;
  name: string;
  website: string | null;
  lastCrawled: string | null;
};

async function upsertBatch(rows: NormalizedCompany[], source: string, now: string) {
  const db = getDb();
  return withBusyRetry(() =>
    db.transaction(async (tx) => {
      const existing = new Set<string>();
      for (const provider of new Set(rows.map((row) => row.atsProvider))) {
        const slugs = rows.filter((row) => row.atsProvider === provider).map((row) => row.slug);
        const found = await tx
          .select({ slug: companies.slug })
          .from(companies)
          .where(and(eq(companies.atsProvider, provider), inArray(companies.slug, slugs)));
        for (const row of found) existing.add(`${provider}:${row.slug}`);
      }

      await tx
        .insert(companies)
        .values(rows.map((row) => ({ ...row, status: "unknown" })))
        .onConflictDoUpdate({
          target: [companies.atsProvider, companies.slug],
          set: {
            name: sql`CASE WHEN ${companies.name} = '' OR ${companies.name} = ${companies.slug} THEN excluded.name ELSE ${companies.name} END`,
            website: sql`COALESCE(${companies.website}, excluded.website)`,
            lastCrawled: sql`COALESCE(excluded.last_crawled, ${companies.lastCrawled})`,
          },
        });

      await tx
        .insert(companySources)
        .values(
          rows.map((row) => ({
            atsProvider: row.atsProvider,
            slug: row.slug,
            source,
            firstSeen: now,
            lastSeen: now,
          })),
        )
        .onConflictDoUpdate({
          target: [companySources.atsProvider, companySources.slug, companySources.source],
          set: { lastSeen: now },
        });

      return rows.filter((row) => !existing.has(`${row.atsProvider}:${row.slug}`));
    }),
  );
}

/** Upsert companies from one source. Existing names/websites are only filled when empty. */
export async function upsertCompanies(
  candidates: Iterable<CompanyCandidate> | AsyncIterable<CompanyCandidate>,
  source: string,
): Promise<UpsertResult> {
  const now = new Date().toISOString();
  const result: UpsertResult = { seen: 0, inserted: 0, invalid: 0, insertedRows: [] };
  let batch = new Map<string, NormalizedCompany>();

  async function flush() {
    if (!batch.size) return;
    const rows = [...batch.values()];
    batch = new Map();
    const inserted = await upsertBatch(rows, source, now);
    result.inserted += inserted.length;
    for (const row of inserted) {
      result.insertedRows.push({ atsProvider: row.atsProvider, slug: row.slug });
    }
  }

  for await (const candidate of candidates) {
    result.seen += 1;
    const slug = normalizeSlug(candidate.atsProvider, candidate.slug);
    if (!slug) {
      result.invalid += 1;
      continue;
    }
    const key = `${candidate.atsProvider}:${slug}`;
    const name = candidate.name?.trim() || slug;
    const previous = batch.get(key);
    batch.set(key, {
      atsProvider: candidate.atsProvider,
      slug,
      name: previous && previous.name !== slug ? previous.name : name,
      website: companyWebsiteDomain(candidate.website) ?? previous?.website ?? null,
      lastCrawled: candidate.lastCrawled ?? previous?.lastCrawled ?? null,
    });
    if (batch.size >= BATCH_SIZE) await flush();
  }
  await flush();
  return result;
}
