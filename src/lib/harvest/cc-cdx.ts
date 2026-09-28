/** Query Common Crawl's CDX index server for career-board URLs and extract company slugs. */
import type { AtsProvider } from "../ats/providers";
import { sleep } from "../concurrency";
import { extractAtsRefs, type AtsRef } from "./patterns";

const COLLINFO_URL = "https://index.commoncrawl.org/collinfo.json";

export type CdxQuery = { provider: AtsProvider; url: string; matchType: "prefix" | "domain" };

export const CDX_QUERIES: CdxQuery[] = [
  { provider: "greenhouse", url: "boards.greenhouse.io/", matchType: "prefix" },
  { provider: "greenhouse", url: "job-boards.greenhouse.io/", matchType: "prefix" },
  { provider: "lever", url: "jobs.lever.co/", matchType: "prefix" },
  { provider: "ashby", url: "jobs.ashbyhq.com/", matchType: "prefix" },
  { provider: "smartrecruiters", url: "jobs.smartrecruiters.com/", matchType: "prefix" },
  { provider: "smartrecruiters", url: "careers.smartrecruiters.com/", matchType: "prefix" },
  { provider: "workable", url: "apply.workable.com/", matchType: "prefix" },
  // Subdomain-based boards: every host under the registered domain.
  { provider: "recruitee", url: "recruitee.com", matchType: "domain" },
  { provider: "bamboohr", url: "bamboohr.com", matchType: "domain" },
];

export type CrawlInfo = { id: string; name: string; "cdx-api": string };

/** All crawls, newest first. */
export async function listCrawls(userAgent: string): Promise<CrawlInfo[]> {
  const response = await fetch(COLLINFO_URL, {
    headers: { Accept: "application/json", "User-Agent": userAgent },
  });
  if (!response.ok) throw new Error(`collinfo.json ${response.status}`);
  const rows = (await response.json()) as CrawlInfo[];
  if (!rows[0]?.["cdx-api"]) throw new Error("collinfo.json had no crawls");
  return rows;
}

/** Explicit crawl ids, else the latest `backfill` crawls (default 1). */
export async function resolveCrawls(
  userAgent: string,
  options: { crawls?: string[]; backfill?: number },
): Promise<CrawlInfo[]> {
  const all = await listCrawls(userAgent);
  if (options.crawls?.length) {
    return options.crawls.map((id) => {
      const found = all.find((row) => row.id === id);
      if (!found) throw new Error(`Unknown crawl ${id}`);
      return found;
    });
  }
  return all.slice(0, Math.max(1, options.backfill ?? 1));
}

const MAX_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * CDX HTTP GET; retries 429 (honoring Retry-After), 5xx, and dropped connections with backoff.
 * Empty string = no results.
 */
async function cdxGet(
  cdxApi: string,
  params: Record<string, string>,
  userAgent: string,
  attempt = 0,
): Promise<string> {
  const url = new URL(cdxApi);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const retry = async (waitMs: number, reason: string) => {
    if (attempt + 1 >= MAX_ATTEMPTS) throw new Error(`CDX ${reason} ${url.searchParams.get("url")}`);
    await sleep(waitMs);
    return cdxGet(cdxApi, params, userAgent, attempt + 1);
  };

  let response: Response;
  let body: string;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/plain", "User-Agent": userAgent },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    body = await response.text();
  } catch (error) {
    return retry(5000 * (attempt + 1), (error as Error).message);
  }

  if (response.status === 429 || response.status >= 500) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000 * (attempt + 1);
    return retry(waitMs, String(response.status));
  }
  if (response.status === 400 || response.status === 404) return "";
  if (!response.ok) throw new Error(`CDX ${response.status} ${url.searchParams.get("url")}`);
  return body;
}

function parseNumPages(raw: string) {
  try {
    const info = JSON.parse(raw) as { pages?: number } | number;
    if (typeof info === "number") return Math.max(0, info);
    if (typeof info?.pages === "number") return Math.max(0, info.pages);
  } catch {
    /* fall through */
  }
  return 1;
}

/** Refs for one query's provider found in CDX JSON lines. */
export function refsFromCdxLines(body: string, provider: AtsProvider): AtsRef[] {
  const refs: AtsRef[] = [];
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { url?: string; status?: string };
      if (!row.url || (row.status && row.status !== "200")) continue;
      refs.push(...extractAtsRefs(row.url).filter((ref) => ref.atsProvider === provider));
    } catch {
      continue;
    }
  }
  return refs;
}

/** Page through one query until the index runs out (or maxPages) and collect unique refs. */
export async function harvestCdxQuery(options: {
  cdxApi: string;
  query: CdxQuery;
  userAgent: string;
  maxPages?: number;
  delayMs: number;
  onPage?: (page: number, pages: number, found: number) => void;
}): Promise<AtsRef[]> {
  const found = new Map<string, AtsRef>();
  const base = { url: options.query.url, matchType: options.query.matchType, output: "json" };
  const pages = Math.min(
    parseNumPages(await cdxGet(options.cdxApi, { ...base, showNumPages: "true" }, options.userAgent)),
    options.maxPages ?? Number.POSITIVE_INFINITY,
  );
  for (let page = 0; page < pages; page++) {
    if (page > 0) await sleep(options.delayMs);
    const body = await cdxGet(
      options.cdxApi,
      { ...base, page: String(page), fl: "url,status" },
      options.userAgent,
    );
    if (!body.trim()) break;
    for (const ref of refsFromCdxLines(body, options.query.provider)) {
      found.set(`${ref.atsProvider}:${ref.slug}`, ref);
    }
    options.onPage?.(page + 1, pages, found.size);
  }
  return [...found.values()];
}
