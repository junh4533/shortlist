/** Focused careers-page crawler: homepage, then one careers link (or /careers), extracting ATS refs from raw HTML. */
import { CheerioCrawler, Configuration, log, LogLevel } from "@crawlee/cheerio";
import { extractAtsRefs, type AtsRef } from "../harvest/patterns";
import { toRegistrableDomain } from "./domain";
import { fetchRobotsForDomains, type RobotsCheck } from "./robots";

const CAREERS_LINK = /careers|jobs|join[- ]?us|join-the-team|work[- ]with[- ]us|open[- ]roles|opportunities|hiring/i;

export type DomainOutcome = {
  domain: string;
  refs: AtsRef[];
  /** "hit:<n>", "none", or "error:<reason>". */
  result: string;
};

type DomainState = {
  refs: Map<string, AtsRef>;
  homeLoaded: boolean;
  careersQueued: boolean;
  error?: string;
};

export type PageSnapshot = { html: string; finalUrl: string; links: { href: string; text: string }[] };

/** Refs in the page (and its final URL, which may be an ATS redirect), plus the next URL to visit if any. */
export function analyzePage(
  domain: string,
  page: PageSnapshot,
  options: { stage: "home" | "careers"; guessCareersPath: boolean },
): { refs: AtsRef[]; next: string | null } {
  const refs = extractAtsRefs(`${page.finalUrl}\n${page.html}`);
  if (refs.length || options.stage === "careers") return { refs, next: null };

  for (const link of page.links) {
    if (!CAREERS_LINK.test(`${link.text} ${link.href}`)) continue;
    let absolute: URL;
    try {
      absolute = new URL(link.href, page.finalUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(absolute.protocol)) continue;
    if (toRegistrableDomain(absolute.hostname) !== domain) continue;
    absolute.hash = "";
    return { refs, next: absolute.toString() };
  }
  return { refs, next: options.guessCareersPath ? `https://${domain}/careers` : null };
}

function outcomeFor(domain: string, state: DomainState): DomainOutcome {
  const refs = [...state.refs.values()];
  if (refs.length) return { domain, refs, result: `hit:${refs.length}` };
  if (!state.homeLoaded) return { domain, refs, result: `error:${state.error ?? "unknown"}` };
  return { domain, refs, result: "none" };
}

export type CrawlOptions = {
  domains: string[];
  userAgent: string;
  guessCareersPath: boolean;
  maxConcurrency?: number;
  respectRobotsTxt?: boolean;
  onProgress?: (done: number, total: number) => void;
};

function stateFor(states: Map<string, DomainState>, domain: string) {
  let state = states.get(domain);
  if (!state) {
    state = { refs: new Map(), homeLoaded: false, careersQueued: false };
    states.set(domain, state);
  }
  return state;
}

function shortError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.match(/\b(\d{3})\b/)?.[1];
  if (/timed? ?out|timeout/i.test(message)) return "timeout";
  if (code) return code;
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) return "dns";
  if (/ECONNREFUSED|ECONNRESET|socket/i.test(message)) return "connection";
  if (/certificate|SSL|TLS/i.test(message)) return "tls";
  if (/robots/i.test(message)) return "robots";
  return "failed";
}

/** Crawl one batch of domains with plain HTTP + Cheerio (no JavaScript). */
export async function crawlCareersBatch(options: CrawlOptions): Promise<DomainOutcome[]> {
  // Failures are recorded per domain in failedRequestHandler; Crawlee's own stack traces are noise here.
  log.setLevel(LogLevel.OFF);
  const states = new Map<string, DomainState>();
  let finished = 0;
  const config = new Configuration({ persistStorage: false });
  const robots =
    options.respectRobotsTxt === false
      ? new Map<string, RobotsCheck>()
      : await fetchRobotsForDomains(options.domains, options.userAgent);

  const crawler: CheerioCrawler = new CheerioCrawler(
    {
      maxConcurrency: options.maxConcurrency ?? 50,
      minConcurrency: Math.min(20, options.maxConcurrency ?? 50),
      autoscaledPoolOptions: { desiredConcurrency: Math.min(40, options.maxConcurrency ?? 50) },
      maxRequestsPerMinute: 3000,
      // A failed homepage is recorded as an error and not retried: the next monthly run tries again.
      maxRequestRetries: 0,
      requestHandlerTimeoutSecs: 12,
      navigationTimeoutSecs: 8,
      // robots.txt is checked up front in parallel (see robots.ts); Crawlee's check is serial.
      respectRobotsTxtFile: false,
      useSessionPool: false,
      preNavigationHooks: [
        (_context, gotOptions) => {
          gotOptions.headers = { ...gotOptions.headers, "user-agent": options.userAgent };
        },
      ],
      async requestHandler({ request, $, body }) {
        const domain = String(request.userData.domain);
        const stage = request.userData.stage as "home" | "careers";
        const state = stateFor(states, domain);
        if (stage === "home") state.homeLoaded = true;
        // Non-HTML responses (e.g. JSON) arrive without a Cheerio handle.
        const links =
          typeof $ === "function"
            ? $("a[href]")
                .map((_, anchor) => ({ href: $(anchor).attr("href") ?? "", text: $(anchor).text().trim() }))
                .get()
            : [];
        const html = typeof body === "string" ? body : body.toString("utf8");
        const { refs, next } = analyzePage(
          domain,
          { html, finalUrl: request.loadedUrl ?? request.url, links },
          { stage, guessCareersPath: options.guessCareersPath },
        );
        for (const ref of refs) state.refs.set(`${ref.atsProvider}:${ref.slug}`, ref);
        if (next && !state.careersQueued && (robots.get(domain)?.(next) ?? true)) {
          state.careersQueued = true;
          await crawler.addRequests([{ url: next, userData: { domain, stage: "careers" } }]);
          return;
        }
        finished += 1;
        options.onProgress?.(finished, options.domains.length);
      },
      async failedRequestHandler({ request }, error) {
        const domain = String(request.userData.domain);
        const state = stateFor(states, domain);
        if (request.userData.stage === "home") state.error = shortError(error);
        finished += 1;
        options.onProgress?.(finished, options.domains.length);
      },
    },
    config,
  );

  const allowed = options.domains.filter((domain) => {
    if (robots.get(domain)?.(`https://${domain}/`) ?? true) return true;
    stateFor(states, domain).error = "robots";
    return false;
  });
  await crawler.run(
    allowed.map((domain) => ({
      url: `https://${domain}/`,
      uniqueKey: `home:${domain}`,
      userData: { domain, stage: "home" },
    })),
  );

  return options.domains.map((domain) => outcomeFor(domain, stateFor(states, domain)));
}
