/** Fetch and evaluate robots.txt for many domains in parallel (Crawlee's built-in check is serial and slow). */
import robotsParser from "robots-parser";
import { mapPool } from "../concurrency";

export type RobotsCheck = (url: string) => boolean;

const ALLOW_ALL: RobotsCheck = () => true;
const DENY_ALL: RobotsCheck = () => false;

/** 4xx or unreachable robots.txt = allow; 5xx = disallow (per the robots exclusion standard). */
export async function fetchRobots(domain: string, userAgent: string, timeoutMs = 5000): Promise<RobotsCheck> {
  const robotsUrl = `https://${domain}/robots.txt`;
  try {
    const response = await fetch(robotsUrl, {
      headers: { "User-Agent": userAgent },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 500) return DENY_ALL;
    if (!response.ok) return ALLOW_ALL;
    const robots = robotsParser(robotsUrl, (await response.text()).slice(0, 500_000));
    return (url) => {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, "");
        // robots.txt is per host; subdomains such as careers.acme.com are not covered by this file.
        if (host !== domain) return true;
        return robots.isAllowed(`https://${domain}${parsed.pathname}${parsed.search}`, userAgent) !== false;
      } catch {
        return true;
      }
    };
  } catch {
    return ALLOW_ALL;
  }
}

export async function fetchRobotsForDomains(domains: string[], userAgent: string, concurrency = 50) {
  const checks = new Map<string, RobotsCheck>();
  await mapPool(domains, concurrency, async (domain) => {
    checks.set(domain, await fetchRobots(domain, userAgent));
  });
  return checks;
}
