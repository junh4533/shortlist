/** Canonical form of an ATS board slug, shared by every importer, harvester, and crawler. */
import type { AtsProvider } from "./ats/providers";

/** Path segments that are never company boards. */
export const SKIP_SLUGS = new Set([
  "embed",
  "www",
  "blog",
  "about",
  "careers",
  "jobs",
  "job",
  "api",
  "app",
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

/**
 * Providers whose public APIs treat slugs case-insensitively (stored lowercase).
 * Lever is case-sensitive: `jobs.lever.co/AIFund` works, `aifund` is a 404.
 */
const CASE_INSENSITIVE = new Set<AtsProvider>([
  "greenhouse",
  "ashby",
  "smartrecruiters",
  "workable",
  "recruitee",
  "bamboohr",
]);

/** Lever and Ashby allow domain-like slugs such as `arcteryx.com` or `candidate.fyi`. */
const DOTS_ALLOWED = new Set<AtsProvider>(["lever", "ashby"]);

export function normalizeSlug(provider: AtsProvider, raw: string): string | null {
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  value = value.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "").trim();
  if (CASE_INSENSITIVE.has(provider)) value = value.toLowerCase();
  if (!value || /[\s/\\]/.test(value)) return null;
  if (value.includes(".")) {
    if (!DOTS_ALLOWED.has(provider) || /^\.|\.\.|\.$/.test(value)) return null;
  }
  if (SKIP_SLUGS.has(value.toLowerCase())) return null;
  return value;
}
