/** Home table query: SQL prefilter for one user, then matchJob scoring, twin collapse, sort, and pagination. */
import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  APPLICATION_STATUSES,
  STATUS_PRIORITY,
  type ApplicationStatus,
} from "../constants";
import type { UserPreferences } from "../config";
import { getDb } from "../db";
import { companies, jobs, jobTracking } from "../db/schema";
import { matchJob } from "../match";
import { jobCollapseKey, listingCollapseKey } from "../url";
import { buildPrefilter } from "./prefilter";

/** Rows fetched from SQL before exact matching; newest first. */
export const CANDIDATE_CAP = 5000;
export const DEFAULT_PAGE_SIZE = 50;

export type ListedJob = {
  atsProvider: string;
  boardSlug: string;
  externalId: string;
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

function formatMoney(value: number) {
  return `$${Math.round(value / 1000)}k`;
}

export function formatPay(
  job: Pick<ListedJob, "salaryMin" | "salaryMax" | "salaryUnknown">,
) {
  if (job.salaryUnknown || (job.salaryMin == null && job.salaryMax == null)) {
    return "Unknown";
  }
  if (job.salaryMin != null && job.salaryMax != null && job.salaryMin !== job.salaryMax) {
    return `${formatMoney(job.salaryMin)}–${formatMoney(job.salaryMax)}`;
  }
  return formatMoney(job.salaryMax ?? job.salaryMin ?? 0);
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

export function formatPostedDate(job: Pick<ListedJob, "postedAt" | "updatedAt">) {
  const raw = job.postedAt ?? job.updatedAt;
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** FTS5 query: every word must prefix-match title, company, or location. */
export function ftsQuery(q: string) {
  const tokens = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.map((token) => `"${token}"*`).join(" ");
}

export type ListOptions = {
  preferences: UserPreferences;
  q?: string;
  status?: string;
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
};

export type MatchedJobsPage = {
  rows: ListedJob[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** True when the SQL candidate cap was hit, so older matches may be missing. */
  truncated: boolean;
};

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
  const validStatus = APPLICATION_STATUSES.includes(options.status as ApplicationStatus)
    ? (options.status as ApplicationStatus)
    : undefined;
  if (validStatus === "new") {
    conditions.push(or(isNull(jobTracking.status), eq(jobTracking.status, "new"))!);
  } else if (validStatus) {
    conditions.push(eq(jobTracking.status, validStatus));
  }

  const candidates = await getDb()
    .select({ job: jobs, status: jobTracking.status })
    .from(jobs)
    .leftJoin(
      jobTracking,
      and(
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
      atsProvider: row.atsProvider,
      boardSlug: row.boardSlug,
      externalId: row.externalId,
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
    });
  }

  const { sort, dir } = parseJobSort(options.sort, options.dir);
  const rows = collapseDuplicates(listed).sort((left, right) =>
    compareListedJobs(left, right, sort, dir),
  );
  return { rows, truncated: candidates.length >= CANDIDATE_CAP };
}

export async function listMatchedJobs(options: ListOptions): Promise<MatchedJobsPage> {
  const pageSize = Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE);
  const { rows, truncated } = await listAllMatchedJobs(options);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pageCount);
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageCount,
    pageSize,
    truncated,
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
