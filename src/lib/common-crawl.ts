/** Query Common Crawl's CDX index for career-board URLs and extract new company slugs. */
import type { AtsProvider } from "./config";

const COLLINFO_URL = "https://index.commoncrawl.org/collinfo.json";

const SKIP_SLUGS = new Set([
  "embed",
  "www",
  "blog",
  "about",
  "careers",
  "jobs",
  "job",
  "api",
  "admin",
  "login",
  "help",
  "support",
  "privacy",
  "terms",
  "static",
  "assets",
  "cdn",
  "js",
  "css",
  "fonts",
  "images",
  "img",
  "search",
  "apply",
  "dashboard",
  "robots.txt",
]);

export const CDX_PREFIXES: { provider: AtsProvider; url: string }[] = [
  { provider: "greenhouse", url: "boards.greenhouse.io/" },
  { provider: "greenhouse", url: "job-boards.greenhouse.io/" },
  { provider: "lever", url: "jobs.lever.co/" },
  { provider: "ashby", url: "jobs.ashbyhq.com/" },
];

export type CrawlInfo = {
  id: string;
  name: string;
  "cdx-api": string;
};

export type HarvestedSlug = {
  atsProvider: AtsProvider;
  slug: string;
};

const SLUG_PATTERNS: { provider: AtsProvider; regex: RegExp }[] = [
  {
    provider: "greenhouse",
    regex: /(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/i,
  },
  { provider: "lever", regex: /jobs\.lever\.co\/([^/?#]+)/i },
  { provider: "ashby", regex: /jobs\.ashbyhq\.com\/([^/?#]+)/i },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** First path segment of a career-board URL, skipping noise like jobs/embed/www. */
export function extractSlug(rawUrl: string): HarvestedSlug | null {
  for (const { provider, regex } of SLUG_PATTERNS) {
    const match = rawUrl.match(regex);
    if (!match?.[1]) continue;
    const slug = decodeURIComponent(match[1]).trim();
    if (!slug || SKIP_SLUGS.has(slug.toLowerCase())) return null;
    if (slug.includes(".")) return null;
    return { atsProvider: provider, slug };
  }
  return null;
}

export async function latestCrawl(userAgent: string): Promise<CrawlInfo> {
  const response = await fetch(COLLINFO_URL, {
    headers: { Accept: "application/json", "User-Agent": userAgent },
  });
  if (!response.ok) {
    throw new Error(`collinfo.json ${response.status}`);
  }
  const rows = (await response.json()) as CrawlInfo[];
  if (!rows[0]?.["cdx-api"]) {
    throw new Error("collinfo.json had no crawls");
  }
  return rows[0];
}

export async function crawlById(
  id: string,
  userAgent: string,
): Promise<CrawlInfo> {
  const response = await fetch(COLLINFO_URL, {
    headers: { Accept: "application/json", "User-Agent": userAgent },
  });
  if (!response.ok) {
    throw new Error(`collinfo.json ${response.status}`);
  }
  const rows = (await response.json()) as CrawlInfo[];
  const found = rows.find((row) => row.id === id);
  if (!found) throw new Error(`Unknown crawl ${id}`);
  return found;
}

type CdxPageInfo = { pages?: number };

/** CDX HTTP GET; retries 5xx with backoff. */
async function cdxGet(
  cdxApi: string,
  params: Record<string, string>,
  userAgent: string,
  attempt = 0,
) {
  const url = new URL(cdxApi);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: { Accept: "text/plain", "User-Agent": userAgent },
  });
  if (
    (response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504) &&
    attempt < 4
  ) {
    await sleep(4000 * (attempt + 1));
    return cdxGet(cdxApi, params, userAgent, attempt + 1);
  }
  if (response.status === 400 || response.status === 404) return "";
  if (!response.ok) {
    throw new Error(`CDX ${response.status} ${url.searchParams.get("url")}`);
  }
  return response.text();
}

function parseNumPages(raw: string, fallback: number) {
  try {
    const info = JSON.parse(raw) as CdxPageInfo | number;
    if (typeof info === "number" && Number.isFinite(info)) {
      return Math.max(0, info);
    }
    if (info && typeof info === "object" && typeof info.pages === "number") {
      return Math.max(0, info.pages);
    }
  } catch {
    /* use fallback */
  }
  return fallback;
}

/** Page through one ATS URL prefix in the CDX index and collect unique slugs. */
export async function harvestPrefix(options: {
  cdxApi: string;
  prefix: string;
  provider: AtsProvider;
  userAgent: string;
  maxPages: number;
  delayMs: number;
  onPage?: (page: number, pages: number, found: number) => void;
}): Promise<HarvestedSlug[]> {
  const found = new Map<string, HarvestedSlug>();
  const pageInfoRaw = await cdxGet(
    options.cdxApi,
    {
      url: options.prefix,
      matchType: "prefix",
      output: "json",
      showNumPages: "true",
    },
    options.userAgent,
  );
  const pages = Math.min(parseNumPages(pageInfoRaw, 1), options.maxPages);
  if (pages < 1) return [];

  for (let page = 0; page < pages; page++) {
    if (page > 0) await sleep(options.delayMs);
    const body = await cdxGet(
      options.cdxApi,
      {
        url: options.prefix,
        matchType: "prefix",
        output: "json",
        page: String(page),
      },
      options.userAgent,
    );
    if (!body.trim()) break;
    for (const line of body.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { url?: string; status?: string };
        if (row.status && row.status !== "200") continue;
        if (!row.url) continue;
        const slug = extractSlug(row.url);
        if (!slug || slug.atsProvider !== options.provider) continue;
        found.set(`${slug.atsProvider}:${slug.slug}`, slug);
      } catch {
        continue;
      }
    }
    options.onPage?.(page + 1, pages, found.size);
  }

  return [...found.values()];
}
