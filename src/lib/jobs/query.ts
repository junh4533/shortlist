/** Home table query: SQL prefilter for one user, then matchJob scoring, twin collapse, sort, and pagination. */
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import {
  APPLICATION_STATUSES,
  STATUS_PRIORITY,
  type ApplicationStatus,
} from "../constants";
import type { UserPreferences } from "../config";
import { getDb } from "../db";
import { companies, duplicateOverrides, jobs, jobTracking } from "../db/schema";
import { matchJob } from "../match";
import { jobCollapseKey, listingCollapseKey } from "../url";
import { jobKey, type DuplicateConfidence } from "./duplicates";
import { formatPay, formatPostedDate } from "./format";
import { buildPrefilter } from "./prefilter";

export { formatPay, formatPostedDate };

/** Rows fetched from SQL before exact matching; newest first. */
export const CANDIDATE_CAP = 5000;
export const DEFAULT_PAGE_SIZE = 50;

export type ListedJob = {
  jobKey: string;
  atsProvider: string;
  boardSlug: string;
  externalId: string;
  dupGroupId: string | null;
  dupConfidence: DuplicateConfidence | null;
  dupReason: string | null;
  companyName: string;
  title: string;
  location: string | null;
  url: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryUnknown: boolean;
  isRemote: boolean | null;
  postedAt: string | null;
  updatedAt: string | null;
  skillsMatched: string[];
  rankScore: number;
  status: ApplicationStatus;
  snippet: string;
};

export const JOB_SORT_COLUMNS = [
  "title",
  "company",
  "location",
  "pay",
  "posted",
  "score",
  "status",
] as const;

export type JobSortColumn = (typeof JOB_SORT_COLUMNS)[number];
export type JobSortDir = "asc" | "desc";

export function defaultJobSortDir(column: JobSortColumn): JobSortDir {
  return column === "score" || column === "pay" || column === "posted"
    ? "desc"
    : "asc";
}

export function parseJobSort(sort?: string, dir?: string) {
  const column = JOB_SORT_COLUMNS.includes(sort as JobSortColumn)
    ? (sort as JobSortColumn)
    : "score";
  const direction: JobSortDir =
    dir === "asc" || dir === "desc" ? dir : defaultJobSortDir(column);
  return { sort: column, dir: direction };
}

function companyNameQuality(job: ListedJob) {
  return job.companyName.toLowerCase() === job.boardSlug.toLowerCase() ? 0 : 1;
}

/** True if `job` should replace `previous` as the visible row of a duplicate group. */
export function preferListedJob(previous: ListedJob, job: ListedJob) {
  const previousRank = STATUS_PRIORITY[previous.status];
  const nextRank = STATUS_PRIORITY[job.status];
  if (nextRank !== previousRank) return nextRank > previousRank;
  if (job.rankScore !== previous.rankScore) return job.rankScore > previous.rankScore;
  const previousPosted =
    Date.parse(previous.postedAt ?? previous.updatedAt ?? "") || 0;
  const nextPosted = Date.parse(job.postedAt ?? job.updatedAt ?? "") || 0;
  if (nextPosted !== previousPosted) return nextPosted > previousPosted;
  return companyNameQuality(job) > companyNameQuality(previous);
}

/** Union-find: merge same-board rows with the same jobCollapseKey or listingCollapseKey; keep the best row. */
export function collapseDuplicates(listed: ListedJob[]) {
  const parent = listed.map((_, index) => index);
  const find = (index: number) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (left: number, right: number) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent[rootLeft] = rootRight;
  };

  const byIdentity = new Map<string, number>();
  const byListing = new Map<string, number>();
  listed.forEach((job, index) => {
    const identity = jobCollapseKey(job);
    const previousIdentity = byIdentity.get(identity);
    if (previousIdentity == null) byIdentity.set(identity, index);
    else union(previousIdentity, index);

    const listing = listingCollapseKey(job);
    const previousListing = byListing.get(listing);
    if (previousListing == null) byListing.set(listing, index);
    else union(previousListing, index);
  });

  const best = new Map<number, ListedJob>();
  listed.forEach((job, index) => {
    const root = find(index);
    const previous = best.get(root);
    if (!previous || preferListedJob(previous, job)) {
      best.set(root, job);
    }
  });
  return [...best.values()];
}

export function compareListedJobs(
  left: ListedJob,
  right: ListedJob,
  sort: JobSortColumn,
  dir: JobSortDir,
) {
  const sign = dir === "asc" ? 1 : -1;
  let cmp = 0;
  switch (sort) {
    case "title":
      cmp = left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
      break;
    case "company":
      cmp = left.companyName.localeCompare(right.companyName, undefined, {
        sensitivity: "base",
      });
      break;
    case "location":
      cmp = (left.location ?? "").localeCompare(right.location ?? "", undefined, {
        sensitivity: "base",
      });
      break;
    case "pay":
      cmp =
        (left.salaryMax ?? left.salaryMin ?? -1) -
        (right.salaryMax ?? right.salaryMin ?? -1);
      break;
    case "posted": {
      const leftTime = Date.parse(left.postedAt ?? left.updatedAt ?? "") || 0;
      const rightTime = Date.parse(right.postedAt ?? right.updatedAt ?? "") || 0;
      cmp = leftTime - rightTime;
      break;
    }
    case "status":
      cmp = STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
      break;
    case "score":
    default:
      cmp = left.rankScore - right.rankScore;
      break;
  }
  if (cmp === 0) {
    return (
      right.rankScore - left.rankScore ||
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
    );
  }
  return cmp * sign;
}

export function isWithinMaxAge(
  postedAt: string | null,
  updatedAt: string | null,
  maxAgeDays: number,
  hideUnknownDate: boolean,
) {
  if (!maxAgeDays || maxAgeDays <= 0) return true;
  const raw = postedAt ?? updatedAt;
  if (!raw) return !hideUnknownDate;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return !hideUnknownDate;
  return Date.now() - date.getTime() <= maxAgeDays * 24 * 60 * 60 * 1000;
}

/** FTS5 query: every word must prefix-match title, company, or location. */
export function ftsQuery(q: string) {
  const tokens = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.map((token) => `"${token}"*`).join(" ");
}

export type ListOptions = {
  userId: string;
  preferences: UserPreferences;
  q?: string;
  status?: string;
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
  /** Show likely cross-platform duplicates as groups (rows are never hidden). */
  grouped?: boolean;
  /** Drop skipped and not-qualified rows unless a status filter asks for them. Default true. */
  hideDismissed?: boolean;
};

export type JobGroup = {
  id: string;
  primary: ListedJob;
  members: ListedJob[];
  confidence: DuplicateConfidence | "manual" | null;
  reason: string | null;
};

export type MatchedJobsPage = {
  groups: JobGroup[];
  totalJobs: number;
  totalGroups: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** True when the SQL candidate cap was hit, so older matches may be missing. */
  truncated: boolean;
  statusCounts: Record<ApplicationStatus, number>;
};

export type DuplicateOverride = { jobKeyA: string; jobKeyB: string; verdict: string };

/**
 * Group rows by their stored duplicate group, then apply the user's overrides:
 * "different" detaches job B from A's group; "same" merges the two rows' groups.
 */
export function groupListedJobs(
  rows: ListedJob[],
  overrides: DuplicateOverride[],
  grouped: boolean,
): JobGroup[] {
  if (!grouped) {
    return rows.map((row) => ({ id: row.jobKey, primary: row, members: [], confidence: null, reason: null }));
  }
  const byKey = new Map(rows.map((row) => [row.jobKey, row]));
  const label = new Map(rows.map((row) => [row.jobKey, row.dupGroupId ?? `solo:${row.jobKey}`]));

  for (const override of overrides) {
    if (override.verdict !== "different") continue;
    const a = byKey.get(override.jobKeyA);
    const b = byKey.get(override.jobKeyB);
    if (a && b && label.get(a.jobKey) === label.get(b.jobKey)) label.set(b.jobKey, `solo:${b.jobKey}`);
  }

  const parent = new Map<string, string>();
  const find = (value: string): string => {
    let root = value;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const manual = new Set<string>();
  for (const override of overrides) {
    if (override.verdict !== "same") continue;
    const a = label.get(override.jobKeyA);
    const b = label.get(override.jobKeyB);
    if (!a || !b) continue;
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
    manual.add(rootB);
  }

  const buckets = new Map<string, ListedJob[]>();
  for (const row of rows) {
    const root = find(label.get(row.jobKey)!);
    buckets.set(root, [...(buckets.get(root) ?? []), row]);
  }

  return [...buckets.entries()].map(([id, members]) => {
    const primary = members.reduce((best, row) => (preferListedJob(best, row) ? row : best));
    const others = members.filter((row) => row !== primary).sort((a, b) => b.rankScore - a.rankScore);
    if (!others.length) return { id, primary, members: [], confidence: null, reason: null };
    if (manual.has(find(id))) {
      return { id, primary, members: others, confidence: "manual", reason: "You marked these as the same job" };
    }
    const auto = members.find((row) => row.dupConfidence);
    return { id, primary, members: others, confidence: auto?.dupConfidence ?? "low", reason: auto?.dupReason ?? null };
  });
}

/** All matching, collapsed, sorted jobs for one user (unpaginated). */
export async function listAllMatchedJobs(
  options: Omit<ListOptions, "page" | "pageSize">,
): Promise<{ rows: ListedJob[]; truncated: boolean }> {
  const prefs = options.preferences;
  const conditions: SQL[] = [buildPrefilter(prefs)];

  const match = options.q ? ftsQuery(options.q) : "";
  if (match) {
    conditions.push(
      sql`"jobs"."rowid" IN (SELECT rowid FROM jobs_fts WHERE jobs_fts MATCH ${match})`,
    );
  }
  const candidates = await getDb()
    .select({ job: jobs, status: jobTracking.status })
    .from(jobs)
    .leftJoin(
      jobTracking,
      and(
        eq(jobTracking.userId, options.userId),
        eq(jobTracking.atsProvider, jobs.atsProvider),
        eq(jobTracking.boardSlug, jobs.boardSlug),
        eq(jobTracking.externalId, jobs.externalId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${jobs.postedTs}, 0)`))
    .limit(CANDIDATE_CAP);

  const listed: ListedJob[] = [];
  for (const { job: row, status } of candidates) {
    const match = matchJob(row, prefs);
    if (!match.ok) continue;
    if (
      !isWithinMaxAge(
        row.postedAt,
        row.updatedAt,
        prefs.freshness.max_age_days,
        prefs.freshness.hide_unknown_date,
      )
    ) {
      continue;
    }
    listed.push({
      jobKey: jobKey(row),
      atsProvider: row.atsProvider,
      boardSlug: row.boardSlug,
      externalId: row.externalId,
      dupGroupId: row.dupGroupId,
      dupConfidence: row.dupConfidence as DuplicateConfidence | null,
      dupReason: row.dupReason,
      companyName: row.companyName,
      title: row.title,
      location: row.location,
      url: row.url,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      salaryUnknown: row.salaryUnknown,
      isRemote: row.isRemote,
      postedAt: row.postedAt,
      updatedAt: row.updatedAt,
      skillsMatched: match.skillsMatched,
      rankScore: match.rankScore,
      status: (status as ApplicationStatus | null) ?? "new",
      snippet: row.cleanText.replace(/\s+/g, " ").trim().slice(0, 300),
    });
  }

  const { sort, dir } = parseJobSort(options.sort, options.dir);
  const rows = collapseDuplicates(listed).sort((left, right) =>
    compareListedJobs(left, right, sort, dir),
  );
  return { rows, truncated: candidates.length >= CANDIDATE_CAP };
}

export async function loadDuplicateOverrides(userId: string): Promise<DuplicateOverride[]> {
  return getDb()
    .select({
      jobKeyA: duplicateOverrides.jobKeyA,
      jobKeyB: duplicateOverrides.jobKeyB,
      verdict: duplicateOverrides.verdict,
    })
    .from(duplicateOverrides)
    .where(eq(duplicateOverrides.userId, userId))
    .orderBy(duplicateOverrides.createdAt);
}

/** Paginated by group, so a group never splits across pages. */
export async function listMatchedJobs(options: ListOptions): Promise<MatchedJobsPage> {
  const pageSize = Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE);
  const grouped = options.grouped ?? true;
  const hideDismissed = options.hideDismissed !== false;
  const [{ rows, truncated }, overrides] = await Promise.all([
    listAllMatchedJobs(options),
    grouped ? loadDuplicateOverrides(options.userId) : Promise.resolve([]),
  ]);
  const validStatus = APPLICATION_STATUSES.includes(options.status as ApplicationStatus)
    ? (options.status as ApplicationStatus)
    : undefined;
  const statusCounts = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<
    ApplicationStatus,
    number
  >;
  for (const row of rows) statusCounts[row.status] += 1;
  const visible = rows.filter((row) => {
    if (validStatus) return row.status === validStatus;
    return !(hideDismissed && (row.status === "not_qualified" || row.status === "skipped"));
  });
  const { sort, dir } = parseJobSort(options.sort, options.dir);
  const groups = groupListedJobs(visible, overrides, grouped).sort((left, right) =>
    compareListedJobs(left.primary, right.primary, sort, dir),
  );
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pageCount);
  return {
    groups: groups.slice((page - 1) * pageSize, page * pageSize),
    totalJobs: visible.length,
    totalGroups: groups.length,
    page,
    pageCount,
    pageSize,
    truncated,
    statusCounts,
  };
}

export async function jobCounts() {
  const db = getDb();
  const [[{ jobCount }], [{ liveCompanies }]] = await Promise.all([
    db.select({ jobCount: sql<number>`count(*)` }).from(jobs).where(isNull(jobs.closedAt)),
    db
      .select({ liveCompanies: sql<number>`count(*)` })
      .from(companies)
      .where(eq(companies.status, "live")),
  ]);
  return { jobCount, liveCompanies };
}
