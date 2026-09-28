/** CLI: harvest new board slugs from Common Crawl CDX (`npm run harvest-cc`). */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadSystemConfig, type AtsProvider } from "../src/lib/config";
import {
  CDX_PREFIXES,
  crawlById,
  harvestPrefix,
  latestCrawl,
} from "../src/lib/common-crawl";
import { migrate } from "../src/lib/db";
import { upsertCompanies } from "../src/lib/harvest/insert";

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function main() {
  if (hasFlag("--help")) {
    console.log(`Usage:
  npm run harvest-cc
  npm run harvest-cc -- --dry-run
  npm run harvest-cc -- --max-pages 2
  npm run harvest-cc -- --provider ashby
  npm run harvest-cc -- --crawl CC-MAIN-2026-30`);
    return;
  }

  const config = loadSystemConfig();
  const userAgent = config.ingest.user_agent;
  const maxPages = argValue("--max-pages")
    ? Number(argValue("--max-pages"))
    : (config.harvest.max_pages ?? Number.POSITIVE_INFINITY);
  const providerFilter = argValue("--provider") as AtsProvider | undefined;
  const dryRun = hasFlag("--dry-run");
  const crawlId = argValue("--crawl");

  const crawl = crawlId
    ? await crawlById(crawlId, userAgent)
    : await latestCrawl(userAgent);
  console.log(`Using ${crawl.id} (${crawl.name})`);

  const prefixes = CDX_PREFIXES.filter(
    (row) =>
      config.ingest.providers.includes(row.provider) &&
      (!providerFilter || row.provider === providerFilter),
  );

  const harvested = [];
  for (const prefix of prefixes) {
    console.log(`CDX ${prefix.url}`);
    try {
      const slugs = await harvestPrefix({
        cdxApi: crawl["cdx-api"],
        prefix: prefix.url,
        provider: prefix.provider,
        userAgent,
        maxPages,
        delayMs: config.harvest.cdx_delay_ms,
        onPage: (page, pages, found) => {
          console.log(`  page ${page}/${pages}  unique slugs=${found}`);
        },
      });
      harvested.push(...slugs);
    } catch (error) {
      console.error(`  skipped ${prefix.url}:`, error);
    }
  }

  const unique = new Map(
    harvested.map((row) => [`${row.atsProvider}:${row.slug}`, row]),
  );
  console.log(`Harvested ${unique.size} unique slugs from CDX`);

  if (dryRun) {
    const sample = [...unique.values()].slice(0, 20);
    for (const row of sample) {
      console.log(`  ${row.atsProvider}  ${row.slug}`);
    }
    return;
  }

  await migrate();
  const result = await upsertCompanies(
    [...unique.values()].map((row) => ({ ...row, lastCrawled: crawl.id })),
    "harvest:cc",
  );
  const inserted = result.inserted;
  const added = result.insertedRows.map((row) => ({
    ats_vendor: row.atsProvider,
    board_slug: row.slug,
  }));

  const outPath = path.join(process.cwd(), "datasets", "commoncrawl_new_slugs.json");
  writeFileSync(outPath, `${JSON.stringify({ crawl: crawl.id, added }, null, 2)}\n`);
  console.log(`Inserted ${inserted} new companies (${unique.size - inserted} already known)`);
  console.log(`Wrote ${outPath}`);
  console.log("Next: npm run ingest   (fetches jobs for unknown boards only)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
