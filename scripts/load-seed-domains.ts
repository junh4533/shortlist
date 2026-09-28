/** CLI: load top-domain lists + company-dataset websites into seed_domains, assign crawl tiers, optional DNS check (`npm run load-seed-domains -- [--dns]`). */
import { existsSync, readFileSync } from "node:fs";
import { and, isNotNull, isNull, sql } from "drizzle-orm";
import { mapPool } from "../src/lib/concurrency";
import { createResolver, domainResolves } from "../src/lib/crawl/dns";
import { toRegistrableDomain } from "../src/lib/crawl/domain";
import { crawlFilterReason, loadDenylist } from "../src/lib/crawl/filters";
import { readSeedList, seedListFiles } from "../src/lib/crawl/seed-lists";
import { getDb, migrate } from "../src/lib/db";
import { companies, seedDomains } from "../src/lib/db/schema";
import { seedCandidatesPath } from "../src/lib/sources/import";

type SeedRow = { domain: string; rank: number | null; source: string };

const BATCH_SIZE = 5000;
const COMPANY_SOURCE = "company-dataset";

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Idempotent per source: re-loading the same list does not inflate list_count. */
async function upsertBatch(rows: SeedRow[]) {
  if (!rows.length) return;
  const values = sql.join(
    rows.map((row) => sql`(${row.domain}, ${row.rank}, 1, ${row.source})`),
    sql`, `,
  );
  const present = sql`instr(',' || seed_domains.sources || ',', ',' || excluded.sources || ',') > 0`;
  await getDb().run(sql`
    INSERT INTO seed_domains (domain, best_rank, list_count, sources) VALUES ${values}
    ON CONFLICT (domain) DO UPDATE SET
      best_rank = CASE
        WHEN seed_domains.best_rank IS NULL THEN excluded.best_rank
        WHEN excluded.best_rank IS NULL THEN seed_domains.best_rank
        ELSE min(seed_domains.best_rank, excluded.best_rank) END,
      list_count = seed_domains.list_count + CASE WHEN ${present} THEN 0 ELSE 1 END,
      sources = CASE
        WHEN ${present} THEN seed_domains.sources
        WHEN seed_domains.sources = '' THEN excluded.sources
        ELSE seed_domains.sources || ',' || excluded.sources END`);
}

async function loadRows(source: string, rows: AsyncIterable<{ domain: string; rank: number | null }>) {
  const deny = loadDenylist();
  const seen = new Set<string>();
  const counts = { read: 0, invalid: 0, filtered: 0, kept: 0 };
  let batch: SeedRow[] = [];
  for await (const row of rows) {
    counts.read += 1;
    const domain = toRegistrableDomain(row.domain);
    if (!domain) {
      counts.invalid += 1;
      continue;
    }
    if (seen.has(domain)) continue;
    seen.add(domain);
    if (crawlFilterReason(domain, deny)) {
      counts.filtered += 1;
      continue;
    }
    counts.kept += 1;
    batch.push({ domain, rank: row.rank, source });
    if (batch.length >= BATCH_SIZE) {
      await upsertBatch(batch);
      batch = [];
    }
  }
  await upsertBatch(batch);
  console.log(
    `${source.padEnd(20)} read=${counts.read} unique=${seen.size} invalid=${counts.invalid} filtered=${counts.filtered} kept=${counts.kept}`,
  );
}

async function* companyWebsites() {
  const file = seedCandidatesPath();
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const { website } = JSON.parse(line) as { website?: string };
    if (website) yield { domain: website, rank: null };
  }
}

async function markKnownDomains() {
  const db = getDb();
  const rows = await db.select({ website: companies.website }).from(companies).where(isNotNull(companies.website));
  const known = [...new Set(rows.map((row) => toRegistrableDomain(row.website ?? "")).filter(Boolean))] as string[];
  for (let index = 0; index < known.length; index += 500) {
    const slice = known.slice(index, index + 500);
    await db.run(sql`
      UPDATE seed_domains SET tier = NULL, result = coalesce(result, 'known')
      WHERE crawled_at IS NULL AND domain IN (${sql.join(slice.map((domain) => sql`${domain}`), sql`, `)})`);
  }
  return known.length;
}

async function assignTiers() {
  await getDb().run(sql`
    UPDATE seed_domains SET tier = CASE
      WHEN instr(',' || sources || ',', ${`,${COMPANY_SOURCE},`}) > 0 THEN 0
      WHEN sources = 'umbrella' THEN NULL
      WHEN list_count >= 3 OR instr(',' || sources || ',', ',cloudflare-radar-us,') > 0 THEN 1
      ELSE 2 END
    WHERE crawled_at IS NULL AND (result IS NULL OR result <> 'known')`);
}

async function dnsCheck(limit: number) {
  const db = getDb();
  const resolver = createResolver();
  const pending = await db
    .select({ domain: seedDomains.domain })
    .from(seedDomains)
    .where(and(isNotNull(seedDomains.tier), isNull(seedDomains.dnsOk), isNull(seedDomains.crawledAt)))
    .orderBy(seedDomains.tier, sql`coalesce(${seedDomains.bestRank}, 99999999)`)
    .limit(limit);
  const results: { domain: string; ok: boolean }[] = [];
  let done = 0;
  const flush = async () => {
    const batch = results.splice(0, results.length);
    for (const value of [true, false]) {
      const domains = batch.filter((row) => row.ok === value).map((row) => row.domain);
      if (!domains.length) continue;
      await db.run(sql`
        UPDATE seed_domains SET dns_ok = ${value ? 1 : 0}
        WHERE domain IN (${sql.join(domains.map((domain) => sql`${domain}`), sql`, `)})`);
    }
  };
  await mapPool(pending, 200, async ({ domain }) => {
    const ok = await domainResolves(resolver, domain);
    if (ok !== null) results.push({ domain, ok });
    done += 1;
    if (results.length >= 1000) await flush();
    if (done % 5000 === 0) console.log(`  dns ${done}/${pending.length}`);
  });
  await flush();
  console.log(`DNS checked ${pending.length} domains`);
}

async function main() {
  await migrate();
  if (!process.argv.includes("--dns-only")) {
    const lists = seedListFiles();
    if (!lists.length) console.log("No lists in datasets/domain_lists (run npm run fetch-datasets)");
    for (const { file, source } of lists) await loadRows(source, readSeedList(file));
    await loadRows(COMPANY_SOURCE, companyWebsites());
    await assignTiers();
    console.log(`Marked domains of ${await markKnownDomains()} known company websites as already covered`);
  }
  if (process.argv.includes("--dns") || process.argv.includes("--dns-only")) {
    await dnsCheck(Number(argValue("--dns-limit") ?? 50000));
  }

  const tiers = await getDb().all<{ tier: number | null; n: number; dns_ok: number; crawled: number }>(sql`
    SELECT tier, count(*) AS n, sum(dns_ok = 1) AS dns_ok, sum(crawled_at IS NOT NULL) AS crawled
    FROM seed_domains GROUP BY tier ORDER BY tier`);
  console.log("\nTier  domains  dns_ok  crawled");
  for (const row of tiers) {
    console.log(
      `${String(row.tier ?? "-").padEnd(5)} ${String(row.n).padStart(8)} ${String(row.dns_ok ?? 0).padStart(7)} ${String(row.crawled ?? 0).padStart(8)}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
