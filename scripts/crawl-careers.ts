/** CLI: crawl company homepages/careers pages from seed_domains and record ATS boards (`npm run crawl-careers -- --tier 0`). */
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { fetchBoard } from "../src/lib/ats";
import { mapPool } from "../src/lib/concurrency";
import { loadSystemConfig } from "../src/lib/config";
import { crawlCareersBatch, type DomainOutcome } from "../src/lib/crawl/careers";
import { getDb, migrate, withBusyRetry } from "../src/lib/db";
import { seedDomains } from "../src/lib/db/schema";
import { upsertCompanies, type CompanyCandidate } from "../src/lib/harvest/insert";
import { normalizeSlug } from "../src/lib/slug";

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function usage() {
  console.log(`Usage:
  npm run crawl-careers -- --tier 0 [--batch 10000] [--max-domains 200] [--probe-label]
Tiers: 0 = company datasets, 1 = popular generic domains, 2 = everything else that passed filters.
Set a contact URL or email in ingest.config.yaml user_agent before large runs.`);
}

/** For domains with no hit, try the domain label as a slug (e.g. acme.com -> acme); weak evidence. */
async function probeDomainLabels(
  outcomes: DomainOutcome[],
  providers: ReturnType<typeof loadSystemConfig>["ingest"]["providers"],
  userAgent: string,
): Promise<CompanyCandidate[]> {
  const hits: CompanyCandidate[] = [];
  const misses = outcomes.filter((outcome) => outcome.result === "none");
  await mapPool(misses, 4, async ({ domain }) => {
    const label = domain.split(".")[0];
    for (const provider of providers) {
      const slug = normalizeSlug(provider, label);
      if (!slug) continue;
      const result = await fetchBoard(provider, slug, {
        userAgent,
        withDetails: () => false,
        previouslyLive: false,
      });
      // Only trust a guessed slug when the postings mention the company's own domain.
      if (
        result.ok &&
        result.jobs.some((job) => `${job.cleanText} ${job.url}`.toLowerCase().includes(domain))
      ) {
        hits.push({ atsProvider: provider, slug, website: domain });
      }
    }
  });
  return hits;
}

async function main() {
  if (process.argv.includes("--help")) return usage();
  const tierArg = argValue("--tier");
  if (tierArg == null) return usage();
  const tier = Number(tierArg);
  const batchSize = Number(argValue("--batch") ?? 10000);
  const maxDomains = Number(argValue("--max-domains") ?? Number.POSITIVE_INFINITY);
  const probeLabels = process.argv.includes("--probe-label") && tier <= 1;
  if (process.argv.includes("--playwright")) {
    console.log(
      "--playwright is not enabled: install @crawlee/playwright and playwright, then add a PlaywrightCrawler path that reuses analyzePage().",
    );
    return;
  }

  await migrate();
  const config = loadSystemConfig();
  const db = getDb();
  let total = 0;
  const totals = { hit: 0, none: 0, error: 0, companies: 0, probed: 0 };

  while (total < maxDomains) {
    const limit = Math.min(batchSize, maxDomains - total);
    const rows = await db
      .select({ domain: seedDomains.domain })
      .from(seedDomains)
      .where(
        and(
          eq(seedDomains.tier, tier),
          isNull(seedDomains.crawledAt),
          or(isNull(seedDomains.dnsOk), eq(seedDomains.dnsOk, true)),
        ),
      )
      .orderBy(sql`coalesce(${seedDomains.bestRank}, 99999999)`)
      .limit(limit);
    if (!rows.length) break;

    const domains = rows.map((row) => row.domain);
    console.log(`Crawling ${domains.length} tier-${tier} domains (${total} done so far)`);
    const outcomes = await crawlCareersBatch({
      domains,
      userAgent: config.ingest.user_agent,
      guessCareersPath: tier <= 1,
      onProgress: (done, count) => {
        if (done % 250 === 0) console.log(`  ${done}/${count}`);
      },
    });

    const candidates: CompanyCandidate[] = outcomes.flatMap((outcome) =>
      outcome.refs.map((ref) => ({ ...ref, website: outcome.domain })),
    );
    if (probeLabels) {
      const probed = await probeDomainLabels(outcomes, config.ingest.providers, config.ingest.user_agent);
      totals.probed += probed.length;
      if (probed.length) await upsertCompanies(probed, "probe:domain-label");
    }
    const upserted = await upsertCompanies(candidates, "crawl:careers");
    totals.companies += upserted.inserted;

    const now = new Date().toISOString();
    await withBusyRetry(() =>
      db.transaction(async (tx) => {
        for (const outcome of outcomes) {
          await tx
            .update(seedDomains)
            .set({ crawledAt: now, result: outcome.result })
            .where(eq(seedDomains.domain, outcome.domain));
        }
      }),
    );
    for (const outcome of outcomes) {
      if (outcome.result.startsWith("hit")) totals.hit += 1;
      else if (outcome.result === "none") totals.none += 1;
      else totals.error += 1;
    }
    total += outcomes.length;
    console.log(
      `  batch done: hits=${totals.hit} none=${totals.none} errors=${totals.error} new companies=${totals.companies}${probeLabels ? ` probed=${totals.probed}` : ""}`,
    );
  }
  console.log(`Crawled ${total} domains. Next: npm run ingest (verifies new boards).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
