/** US-focused crawl filters: generic endings only, no gov/edu/mil or country codes, no infrastructure hosts. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { isJobPlatformDomain, publicSuffixOf } from "./domain";

export const ALLOWED_SUFFIXES = new Set(["com", "io", "ai", "co", "dev", "app", "tech", "net", "org", "us"]);

/** Label keywords that mark infrastructure rather than a company homepage. */
const INFRA_LABEL = /(^|[.-])(cdn|static|assets|tracking|tracker|analytics|adserver|adserv|pixel|metrics|telemetry|dns)([.-]|$)/;

let denylist: Set<string> | null = null;

export function loadDenylist(file = path.join(process.cwd(), "src", "lib", "crawl", "denylist.txt")) {
  denylist ??= new Set(
    readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.replace(/#.*/, "").trim().toLowerCase())
      .filter(Boolean),
  );
  return denylist;
}

export type FilterReason = "suffix" | "denylist" | "job-platform" | "infrastructure" | null;

/** Why a registrable domain is excluded from crawling, or null if it may be crawled. */
export function crawlFilterReason(domain: string, deny = loadDenylist()): FilterReason {
  if (!ALLOWED_SUFFIXES.has(publicSuffixOf(domain))) return "suffix";
  if (deny.has(domain)) return "denylist";
  if (isJobPlatformDomain(domain)) return "job-platform";
  if (INFRA_LABEL.test(domain)) return "infrastructure";
  return null;
}
