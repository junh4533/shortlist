/** Load jobs from SQLite, run matchJob, collapse duplicates, and sort for the home table. */
import { loadSearchConfig } from "./config";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "./constants";
import { getDb } from "./db";
import { companies, jobs, jobTracking } from "./db/schema";
import { matchJob } from "./match";
import { jobCollapseKey, listingCollapseKey } from "./url";

const STATUS_PRIORITY: Record<ApplicationStatus, number> = {
  offered: 7,
  interviewing: 6,
  applied: 5,
  interested: 4,
  rejected: 3,
  not_qualified: 2,
  skipped: 1,
  new: 0,
};

function companyNameQuality(job: ListedJob) {
  return job.companyName.toLowerCase() === job.boardSlug.toLowerCase() ? 0 : 1;
}

function preferListedJob(previous: ListedJob, job: ListedJob) {
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

/** Union-find: merge rows with the same jobCollapseKey or listingCollapseKey; keep the best row. */
function collapseDuplicates(listed: ListedJob[]) {
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

function compareListedJobs(
  left: ListedJob,
  right: ListedJob,
  sort: JobSortColumn,
  dir: JobSortDir,
) {
  const sign = dir === "asc" ? 1 : -1;
  let cmp = 0;
  switch (sort) {
    case "title":
      cmp = left.title.localeCompare(right.title, undefined, {
        sensitivity: "base",
      });
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
  if (
    job.salaryMin != null &&
    job.salaryMax != null &&
    job.salaryMin !== job.salaryMax
  ) {
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

export function formatPostedDate(
  job: Pick<ListedJob, "postedAt" | "updatedAt">,
) {
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

/** SELECT * jobs, matchJob in JS, then q/status/sort. Not a SQL WHERE from YAML. */
export function listMatchedJobs(options?: {
  status?: string;
  q?: string;
  sort?: string;
  dir?: string;
}): ListedJob[] {
  const config = loadSearchConfig();
  const { sqlite, db } = getDb();
  const rows = db.select().from(jobs).all();
  const tracking = db.select().from(jobTracking).all();
  sqlite.close();

  const statusByKey = new Map(
    tracking.map((row) => [
      `${row.atsProvider}:${row.boardSlug}:${row.externalId}`,
      row.status as ApplicationStatus,
    ]),
  );

  const query = options?.q?.trim().toLowerCase() ?? "";
  const statusFilter = options?.status;
  const { sort, dir } = parseJobSort(options?.sort, options?.dir);
  const validStatus =
    statusFilter &&
    APPLICATION_STATUSES.includes(statusFilter as ApplicationStatus)
      ? (statusFilter as ApplicationStatus)
      : undefined;

  const listed = rows
    .map((row) => {
      const match = matchJob(
        {
          title: row.title,
          location: row.location,
          cleanText: row.cleanText,
          isRemote: row.isRemote,
          workplaceType: row.workplaceType,
          salaryMin: row.salaryMin,
          salaryMax: row.salaryMax,
          salaryUnknown: row.salaryUnknown,
          postedAt: row.postedAt,
          updatedAt: row.updatedAt,
        },
        config,
      );
      const status =
        statusByKey.get(
          `${row.atsProvider}:${row.boardSlug}:${row.externalId}`,
        ) ?? "new";
      return { row, match, status };
    })
    .filter(({ match, row, status }) => {
      if (!match.ok) return false;
      if (
        !isWithinMaxAge(
          row.postedAt,
          row.updatedAt,
          config.freshness.max_age_days,
          config.freshness.hide_unknown_date,
        )
      ) {
        return false;
      }
      if (validStatus && status !== validStatus) return false;
      if (!query) return true;
      return (
        row.title.toLowerCase().includes(query) ||
        row.companyName.toLowerCase().includes(query) ||
        (row.location ?? "").toLowerCase().includes(query)
      );
    })
    .map(({ row, match, status }) => ({
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
      status,
    }));

  return collapseDuplicates(listed).sort((left, right) =>
    compareListedJobs(left, right, sort, dir),
  );
}

export function jobCounts() {
  const { sqlite, db } = getDb();
  const jobCount = db.select().from(jobs).all().length;
  const liveCompanies = db
    .select()
    .from(companies)
    .all()
    .filter((row) => row.status === "live").length;
  sqlite.close();
  return { jobCount, liveCompanies };
}
