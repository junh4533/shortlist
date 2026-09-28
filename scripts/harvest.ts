/** CLI: discover new board slugs from free sources (`npm run harvest -- --source cc|ccidx|github|hn|probe`). */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isAtsProvider, type AtsProvider } from "../src/lib/ats/providers";
import { loadSystemConfig } from "../src/lib/config";
import { getDb, migrate } from "../src/lib/db";
import { companies } from "../src/lib/db/schema";
import { CDX_QUERIES, harvestCdxQuery, resolveCrawls } from "../src/lib/harvest/cc-cdx";
import { harvestColumnar } from "../src/lib/harvest/cc-columnar";
import { harvestGithubReadmes } from "../src/lib/harvest/github-readmes";
import { harvestHn } from "../src/lib/harvest/hn";
import { upsertCompanies, type CompanyCandidate } from "../src/lib/harvest/insert";
import { probeTargets, type ProbeTarget } from "../src/lib/harvest/probe";
import { seedCandidatesPath } from "../src/lib/sources/import";

const SOURCES = ["cc", "ccidx", "github", "hn", "probe"] as const;
type Source = (typeof SOURCES)[number];

function argValues(flag: string) {
  const values: string[] = [];
  process.argv.forEach((arg, index) => {
    if (arg === flag && process.argv[index + 1]) values.push(process.argv[index + 1]);
  });
  return values;
}

function argValue(flag: string) {
  return argValues(flag)[0];
}

function numberArg(flag: string) {
  const value = argValue(flag);
  return value == null ? undefined : Number(value);
}

function usage() {
  console.log(`Usage:
  npm run harvest -- --source cc [--crawl CC-MAIN-2026-30 ...] [--backfill 3] [--max-pages N] [--provider p]
  npm run harvest -- --source ccidx [--crawl CC-MAIN-2026-30] [--files 2]
  npm run harvest -- --source github
  npm run harvest -- --source hn [--months 3]
  npm run harvest -- --source probe [--limit 500] [--provider greenhouse]
Add --dry-run to print what would be inserted.`);
}

async function harvestCc(config: ReturnType<typeof loadSystemConfig>) {
  const userAgent = config.ingest.user_agent;
  const provider = argValue("--provider");
  const crawls = await resolveCrawls(userAgent, {
    crawls: [...argValues("--crawl"), ...config.harvest.crawls],
    backfill: numberArg("--backfill"),
  });
  const queries = CDX_QUERIES.filter(
    (query) =>
      config.ingest.providers.includes(query.provider) && (!provider || query.provider === provider),
  );
  const refs: CompanyCandidate[] = [];
  for (const crawl of crawls) {
    console.log(`Using ${crawl.id} (${crawl.name})`);
    for (const query of queries) {
      console.log(`CDX ${query.matchType} ${query.url}`);
      try {
        const found = await harvestCdxQuery({
          cdxApi: crawl["cdx-api"],
          query,
          userAgent,
          maxPages: numberArg("--max-pages") ?? config.harvest.max_pages,
          delayMs: config.harvest.cdx_delay_ms,
          onPage: (page, pages, count) => console.log(`  page ${page}/${pages}  unique slugs=${count}`),
        });
        refs.push(...found.map((ref) => ({ ...ref, lastCrawled: crawl.id })));
      } catch (error) {
        console.error(`  skipped ${query.url}: ${(error as Error).message}`);
      }
    }
  }
  return { refs, label: crawls.map((crawl) => crawl.id).join(",") };
}

async function harvestCcIndex(config: ReturnType<typeof loadSystemConfig>) {
  const [crawl] = await resolveCrawls(config.ingest.user_agent, {
    crawls: argValues("--crawl"),
    backfill: 1,
  });
  console.log(`Columnar index ${crawl.id}`);
  const refs = await harvestColumnar({
    crawl: crawl.id,
    files: numberArg("--files"),
    onFile: (index, total, found) => console.log(`  file ${index}/${total}  unique slugs=${found}`),
  });
  return { refs: refs.map((ref) => ({ ...ref, lastCrawled: crawl.id })), label: crawl.id };
}

function probeTargetList(limit: number): ProbeTarget[] {
  const file = seedCandidatesPath();
  if (!existsSync(file)) {
    console.log(`No ${file}; run npm run import-companies first`);
    return [];
  }
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(0, limit)
    .map((line) => JSON.parse(line) as ProbeTarget);
}

async function harvestProbe(config: ReturnType<typeof loadSystemConfig>) {
  const provider = argValue("--provider");
  const providers = config.ingest.providers.filter((p) => !provider || p === provider);
  const known = new Set(
    (await getDb().select({ p: companies.atsProvider, s: companies.slug }).from(companies)).map(
      (row) => `${row.p}:${row.s}`,
    ),
  );
  const targets = probeTargetList(numberArg("--limit") ?? 500);
  console.log(`Probing ${targets.length} companies against ${providers.join(", ")}`);
  const hits = await probeTargets({
    targets,
    providers,
    userAgent: config.ingest.user_agent,
    known: (p, slug) => known.has(`${p}:${slug}`),
    onProgress: (done, total, count) => console.log(`  ${done}/${total} attempts  hits=${count}`),
  });
  return { refs: hits, label: "probe" };
}

async function main() {
  if (process.argv.includes("--help")) return usage();
  const source = argValue("--source") as Source | undefined;
  if (!source || !SOURCES.includes(source)) return usage();
  const provider = argValue("--provider");
  if (provider && !isAtsProvider(provider)) throw new Error(`Unknown provider ${provider}`);

  const config = loadSystemConfig();
  const dryRun = process.argv.includes("--dry-run");
  await migrate();

  let result: { refs: CompanyCandidate[]; label: string };
  if (source === "cc") result = await harvestCc(config);
  else if (source === "ccidx") result = await harvestCcIndex(config);
  else if (source === "github") {
    const refs = await harvestGithubReadmes(
      config.harvest.github_readmes,
      config.ingest.user_agent,
      (repo, found, error) => console.log(`  ${repo}: ${error ?? `${found} refs`}`),
    );
    result = { refs, label: "github" };
  } else if (source === "hn") {
    const refs = await harvestHn(numberArg("--months") ?? 1, config.ingest.user_agent, (title, comments, found) =>
      console.log(`  ${title}: ${comments} comments, ${found} unique refs so far`),
    );
    result = { refs, label: "hn" };
  } else result = await harvestProbe(config);

  const enabled = new Set<AtsProvider>(config.ingest.providers);
  const refs = result.refs.filter((ref) => enabled.has(ref.atsProvider));
  const unique = new Map(refs.map((ref) => [`${ref.atsProvider}:${ref.slug}`, ref]));
  console.log(`Harvested ${unique.size} unique slugs (${source})`);

  if (dryRun) {
    for (const ref of [...unique.values()].slice(0, 25)) console.log(`  ${ref.atsProvider}  ${ref.slug}`);
    return;
  }

  const upserted = await upsertCompanies(unique.values(), `harvest:${source}`);
  console.log(`Inserted ${upserted.inserted} new companies (${upserted.seen - upserted.inserted} already known)`);
  if (source === "cc") {
    const outPath = path.join(process.cwd(), "datasets", "commoncrawl_new_slugs.json");
    const added = upserted.insertedRows.map((row) => ({ ats_vendor: row.atsProvider, board_slug: row.slug }));
    writeFileSync(outPath, `${JSON.stringify({ crawl: result.label, added }, null, 2)}\n`);
    console.log(`Wrote ${outPath}`);
  }
  console.log("Next: npm run ingest   (fetches jobs for unknown boards only)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
