/** Import every dataset in the source registry into companies, and collect website-only rows as crawl seeds. */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { AtsProvider } from "../ats/providers";
import { getDb } from "../db";
import { extractAtsRefs } from "../harvest/patterns";
import { upsertCompanies, type CompanyCandidate } from "../harvest/insert";
import { SOURCE_READERS } from "./readers";
import type { SourceReader, SourceRow } from "./registry";

export type SeedCandidate = { name?: string; website: string; source: string };

export type SourceImportStats = {
  source: string;
  rows: number;
  nonUs: number;
  seen: number;
  inserted: number;
  invalid: number;
  onlyInSource: number;
  seedCandidates: number;
};

/** Company candidates for one row: ATS refs from its URL, else its explicit provider + slug. */
export function resolveRow(row: SourceRow, allowed: ReadonlySet<AtsProvider>): CompanyCandidate[] {
  let refs = row.atsUrl ? extractAtsRefs(row.atsUrl) : [];
  if (row.atsProvider) refs = refs.filter((ref) => ref.atsProvider === row.atsProvider);
  if (!refs.length && row.atsProvider && row.slug) {
    refs = [{ atsProvider: row.atsProvider, slug: row.slug }];
  }
  return refs
    .filter((ref) => allowed.has(ref.atsProvider))
    .map((ref) => ({
      ...ref,
      name: row.name,
      website: row.website,
      lastCrawled: row.lastCrawled,
    }));
}

async function onlyInSource(source: string) {
  const [row] = await getDb().all<{ n: number }>(sql`
    SELECT count(*) AS n FROM company_sources s
    WHERE s.source = ${source}
      AND NOT EXISTS (
        SELECT 1 FROM company_sources o
        WHERE o.ats_provider = s.ats_provider AND o.slug = s.slug AND o.source <> s.source
      )`);
  return Number(row?.n ?? 0);
}

async function importSource(
  reader: SourceReader,
  cwd: string,
  allowed: ReadonlySet<AtsProvider>,
  seeds: SeedCandidate[],
): Promise<SourceImportStats> {
  let rows = 0;
  let nonUs = 0;
  let seedCandidates = 0;

  async function* candidates() {
    for await (const row of reader.read(cwd)) {
      rows += 1;
      if (row.countryCode && row.countryCode !== "US") {
        nonUs += 1;
        continue;
      }
      const resolved = resolveRow(row, allowed);
      if (resolved.length) {
        yield* resolved;
      } else if (!row.atsProvider && row.website) {
        // No supported ATS link (website only, or links to a custom careers page): crawl the company.
        seeds.push({ name: row.name, website: row.website, source: reader.id });
        seedCandidates += 1;
      }
    }
  }

  const result = await upsertCompanies(candidates(), reader.id);
  return {
    source: reader.id,
    rows,
    nonUs,
    seen: result.seen,
    inserted: result.inserted,
    invalid: result.invalid,
    onlyInSource: await onlyInSource(reader.id),
    seedCandidates,
  };
}

export function seedCandidatesPath(cwd = process.cwd()) {
  return path.join(cwd, "datasets", "seed-candidates.jsonl");
}

export async function importAllSources(options: {
  cwd?: string;
  providers: readonly AtsProvider[];
  only?: string;
  log?: (line: string) => void;
}) {
  const cwd = options.cwd ?? process.cwd();
  const allowed = new Set(options.providers);
  const seeds: SeedCandidate[] = [];
  const stats: SourceImportStats[] = [];
  for (const reader of SOURCE_READERS) {
    if (options.only && reader.id !== options.only) continue;
    const result = await importSource(reader, cwd, allowed, seeds);
    stats.push(result);
    options.log?.(
      `${result.source.padEnd(14)} rows=${result.rows} non-US=${result.nonUs} candidates=${result.seen} new=${result.inserted} invalid=${result.invalid} only-here=${result.onlyInSource} seeds=${result.seedCandidates}`,
    );
  }
  if (!options.only || seeds.length) {
    const unique = new Map(seeds.map((seed) => [seed.website.toLowerCase(), seed]));
    writeFileSync(
      seedCandidatesPath(cwd),
      [...unique.values()].map((seed) => JSON.stringify(seed)).join("\n") + (unique.size ? "\n" : ""),
    );
    options.log?.(`Wrote ${unique.size} seed candidates to ${seedCandidatesPath(cwd)}`);
  }
  return stats;
}
