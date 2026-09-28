/** SERP gap-fill: `site:` queries against ATS hosts, with a hard query cap and 30-day repeat protection. */
import { extractAtsRefs, type AtsRef } from "../patterns";

export type SerpProviderId = "serper" | "serpapi";

export type SerpProvider = {
  id: SerpProviderId;
  /** Result URLs for one query (first page, 10 results). */
  search(query: string): Promise<string[]>;
};

export const SERP_HOSTS = [
  "jobs.ashbyhq.com",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.smartrecruiters.com",
  "apply.workable.com",
  "recruitee.com",
  "bamboohr.com/careers",
];

const ROLE_TERMS = [
  "software engineer",
  "frontend engineer",
  "full stack",
  "backend engineer",
  "data engineer",
  "machine learning",
  "product designer",
  "devops",
];

const METROS = [
  "New York",
  "San Francisco",
  "Seattle",
  "Austin",
  "Boston",
  "Chicago",
  "Los Angeles",
  "Denver",
  "remote",
];

/** Recent Y Combinator batch names, newest first (YC runs four batches a year). */
export function ycBatchTerms(now = new Date()) {
  const year = now.getUTCFullYear();
  const seasons = ["Fall", "Summer", "Spring", "Winter"];
  return [year, year - 1].flatMap((y) => seasons.map((season) => `"YC ${season} ${y}"`));
}

/** Every query in a stable order, round-robin across hosts so small caps still cover every ATS. */
export function generateSerpQueries(now = new Date()) {
  const terms = [...ROLE_TERMS, ...METROS, ...ycBatchTerms(now)];
  const queries: string[] = [];
  for (const term of terms) {
    for (const host of SERP_HOSTS) queries.push(`site:${host} ${term}`);
  }
  return queries;
}

export type SerpRunResult = {
  queriesRun: number;
  skippedRecent: number;
  results: number;
  refs: AtsRef[];
  errors: string[];
};

/**
 * Run at most `maxQueries` queries, skipping any run in the last 30 days.
 * `record` is called after each query with its result count and refs, so callers can persist progress.
 */
export async function runSerpHarvest(options: {
  provider: SerpProvider;
  queries: string[];
  maxQueries: number;
  ranRecently: (query: string) => boolean | Promise<boolean>;
  record: (query: string, results: number, refs: AtsRef[]) => Promise<void>;
}): Promise<SerpRunResult> {
  if (!Number.isFinite(options.maxQueries) || options.maxQueries < 1) {
    throw new Error("maxQueries must be a positive number");
  }
  const run: SerpRunResult = { queriesRun: 0, skippedRecent: 0, results: 0, refs: [], errors: [] };
  const found = new Map<string, AtsRef>();
  for (const query of options.queries) {
    if (run.queriesRun >= options.maxQueries) break;
    if (await options.ranRecently(query)) {
      run.skippedRecent += 1;
      continue;
    }
    run.queriesRun += 1;
    try {
      const links = await options.provider.search(query);
      const refs = extractAtsRefs(links.join("\n"));
      for (const ref of refs) found.set(`${ref.atsProvider}:${ref.slug}`, ref);
      run.results += links.length;
      await options.record(query, links.length, refs);
    } catch (error) {
      run.errors.push(`${query}: ${(error as Error).message}`);
      // Quota or auth errors will repeat for every query; stop instead of burning the cap.
      if (/\b(401|402|403|429)\b/.test((error as Error).message)) break;
    }
  }
  run.refs = [...found.values()];
  return run;
}
