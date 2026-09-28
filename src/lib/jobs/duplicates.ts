/**
 * Likely cross-platform duplicates: the same company posting the same role on two boards.
 * Groups are only ever shown together in the UI; rows are never removed or hidden.
 */
import { createHash } from "node:crypto";
import { companyWebsiteDomain } from "../crawl/domain";

export type CompanyConfidence = "strong" | "medium" | "weak";
export type DuplicateConfidence = "high" | "medium" | "low";

const COMPANY_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "technologies",
  "technology",
  "labs",
  "hq",
  "group",
  "holdings",
]);

export function normalizeCompanyName(name: string) {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (words.length > 1 && COMPANY_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join("");
}

export function normalizeSlugForCompany(slug: string) {
  return slug
    .toLowerCase()
    .replace(/[-_]?(inc|hq|jobs|careers)$/, "")
    .replace(/[^a-z0-9]+/g, "");
}

export type CompanyIdentity = {
  /** Registrable domain from the company website, when known. */
  domain: string | null;
  /** Normalized name (or slug when the board never reported a real name). */
  name: string;
  nameFromSlug: boolean;
};

export function companyIdentity(company: { name: string; slug: string; website: string | null }): CompanyIdentity {
  const domain = companyWebsiteDomain(company.website);
  const realName = company.name && company.name.toLowerCase() !== company.slug.toLowerCase();
  const name = realName ? normalizeCompanyName(company.name) : normalizeSlugForCompany(company.slug);
  return { domain, name: name || normalizeSlugForCompany(company.slug), nameFromSlug: !realName };
}

/** Stored summary: the strongest key a company has and how much it can be trusted. */
export function companyKey(company: { name: string; slug: string; website: string | null }) {
  const identity = companyIdentity(company);
  if (identity.domain) return { key: `d:${identity.domain}`, confidence: "strong" as CompanyConfidence };
  return {
    key: `n:${identity.name}`,
    confidence: (identity.nameFromSlug ? "weak" : "medium") as CompanyConfidence,
  };
}

/** Parentheticals that only restate work mode or US location, e.g. "(Remote)" or "(NYC, Hybrid)". */
const WORK_MODE_PARENTHETICAL =
  /\((?=[^)]*\b(remote|hybrid|on-?site|in[- ]office|us|usa|u\.s\.|united states|nyc|new york|sf|san francisco)\b)[^)]*\)/gi;

/**
 * Title identity: lowercase, no punctuation or work-mode suffixes; seniority words and team
 * parentheticals ("Product Designer (Trading)") are kept so distinct roles stay distinct.
 */
export function titleKey(title: string) {
  return title
    .toLowerCase()
    .replace(WORK_MODE_PARENTHETICAL, " ")
    .replace(/\s[-–—|]\s*(remote|hybrid|on-?site|in[- ]office)\b.*$/, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const CITY_ALIASES: Record<string, string> = {
  nyc: "new york",
  "new york city": "new york",
  sf: "san francisco",
  "sf bay area": "san francisco",
  la: "los angeles",
  dc: "washington",
};

function isRemoteLocation(job: { location: string | null; isRemote: boolean | null; workplaceType: string | null }) {
  return job.isRemote === true || job.workplaceType === "remote" || /\bremote\b/i.test(job.location ?? "");
}

export function cityOf(location: string | null) {
  const first = (location ?? "")
    .toLowerCase()
    .replace(/\b(remote|hybrid|on-?site)\b/g, " ")
    .split(/[,;/|(]/)[0]
    .replace(/[^a-z ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return CITY_ALIASES[first] ?? first;
}

export function locationCompatible(
  a: { location: string | null; isRemote: boolean | null; workplaceType: string | null },
  b: { location: string | null; isRemote: boolean | null; workplaceType: string | null },
) {
  if (isRemoteLocation(a) && isRemoteLocation(b)) return true;
  const cityA = cityOf(a.location);
  const cityB = cityOf(b.location);
  return Boolean(cityA) && cityA === cityB;
}

export type GroupableJob = {
  key: string;
  atsProvider: string;
  boardSlug: string;
  title: string;
  location: string | null;
  isRemote: boolean | null;
  workplaceType: string | null;
  company: CompanyIdentity;
};

export type DuplicateAssignment = {
  groupId: string;
  confidence: DuplicateConfidence;
  reason: string;
};

const RANK: Record<DuplicateConfidence, number> = { low: 0, medium: 1, high: 2 };

function edgeFor(a: GroupableJob, b: GroupableJob): { confidence: DuplicateConfidence; reason: string } | null {
  const sameLocation = locationCompatible(a, b);
  const where = sameLocation ? "same title and location" : "same title, different locations";
  if (a.company.domain && b.company.domain) {
    if (a.company.domain !== b.company.domain) return null;
    return {
      confidence: sameLocation ? "high" : "low",
      reason: `Same company domain (${a.company.domain}), ${where}`,
    };
  }
  if (a.company.name !== b.company.name || !a.company.name) return null;
  if (a.company.nameFromSlug || b.company.nameFromSlug) {
    return { confidence: "low", reason: `Similar board names (${a.boardSlug} / ${b.boardSlug}), ${where}` };
  }
  return {
    confidence: sameLocation ? "medium" : "low",
    reason: `Same company name, ${where}`,
  };
}

/** Union-find over jobs on different boards with the same company and title. Group confidence = weakest link. */
export function groupJobs(jobs: GroupableJob[]): Map<string, DuplicateAssignment> {
  const parent = jobs.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const edges: { a: number; b: number; confidence: DuplicateConfidence; reason: string }[] = [];

  const buckets = new Map<string, number[]>();
  jobs.forEach((job, index) => {
    const title = titleKey(job.title);
    if (!title) return;
    for (const companyPart of [job.company.domain ? `d:${job.company.domain}` : null, `n:${job.company.name}`]) {
      if (!companyPart || companyPart === "n:") continue;
      const bucketKey = `${companyPart}|${title}`;
      buckets.set(bucketKey, [...(buckets.get(bucketKey) ?? []), index]);
    }
  });

  const seenPairs = new Set<string>();
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = jobs[members[i]];
        const b = jobs[members[j]];
        if (a.atsProvider === b.atsProvider && a.boardSlug === b.boardSlug) continue;
        const pairKey = [members[i], members[j]].sort((x, y) => x - y).join(":");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const edge = edgeFor(a, b);
        if (!edge) continue;
        edges.push({ a: members[i], b: members[j], ...edge });
        parent[find(members[i])] = find(members[j]);
      }
    }
  }

  const weakest = new Map<number, { confidence: DuplicateConfidence; reason: string }>();
  for (const edge of edges) {
    const root = find(edge.a);
    const current = weakest.get(root);
    if (!current || RANK[edge.confidence] < RANK[current.confidence]) {
      weakest.set(root, { confidence: edge.confidence, reason: edge.reason });
    }
  }

  const membersByRoot = new Map<number, string[]>();
  jobs.forEach((job, index) => {
    const root = find(index);
    if (!weakest.has(root)) return;
    membersByRoot.set(root, [...(membersByRoot.get(root) ?? []), job.key]);
  });

  const assignments = new Map<string, DuplicateAssignment>();
  for (const [root, keys] of membersByRoot) {
    const groupId = `g_${createHash("sha1").update([...keys].sort()[0]).digest("hex").slice(0, 12)}`;
    const edge = weakest.get(root)!;
    for (const key of keys) assignments.set(key, { groupId, ...edge });
  }
  return assignments;
}

/** Stable job key used by duplicate overrides. */
export function jobKey(job: { atsProvider: string; boardSlug: string; externalId: string }) {
  return `${job.atsProvider}|${job.boardSlug}|${job.externalId}`;
}

/** Overrides store the pair in sorted order. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
