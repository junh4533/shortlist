/** Server Component for `/jobs`: SSR the ranked job table (grouped likely duplicates, paginated). */
import Link from "next/link";
import { Check } from "lucide-react";
import {
  APPLICATION_STATUS_CLASSES,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
} from "@/lib/constants";
import {
  CANDIDATE_CAP,
  defaultJobSortDir,
  jobCounts,
  parseJobSort,
  type JobSortColumn,
  type JobSortDir,
} from "@/lib/jobs/query";
import { redirect } from "next/navigation";
import type { UserPreferences } from "@/lib/config";
import { requireApprovedUser } from "@/lib/current-user";
import { cachedMatchedJobs } from "@/lib/jobs/cached";
import { getUserProfile } from "@/lib/preferences-store";
import { markDuplicate } from "../actions";
import { AnimatedJobGroups } from "../job-row";

export const dynamic = "force-dynamic";

type PageParams = {
  q?: string;
  status?: string;
  sort?: string;
  dir?: string;
  page?: string;
  flat?: string;
  showDismissed?: string;
};

function hrefWith(params: PageParams, changes: Partial<PageParams>) {
  const merged = { ...params, ...changes };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/jobs?${query}` : "/jobs";
}

function sortHref(params: PageParams, column: JobSortColumn) {
  const current = parseJobSort(params.sort, params.dir);
  const nextDir: JobSortDir =
    current.sort === column
      ? current.dir === "asc"
        ? "desc"
        : "asc"
      : defaultJobSortDir(column);
  return hrefWith(params, { sort: column, dir: nextDir, page: undefined });
}

function SortHeader({
  label,
  column,
  params,
}: {
  label: string;
  column: JobSortColumn;
  params: PageParams;
}) {
  const current = parseJobSort(params.sort, params.dir);
  const active = current.sort === column;
  return (
    <th
      className="px-3 py-2"
      aria-sort={active ? (current.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={sortHref(params, column)}
        className={`inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 ${active ? "text-zinc-900 dark:text-zinc-100" : ""}`}
      >
        {label}
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400" aria-hidden="true">
          {active ? (current.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </Link>
    </th>
  );
}

function pageList(page: number, pageCount: number) {
  const wanted = new Set([1, pageCount, page - 2, page - 1, page, page + 1, page + 2]);
  return [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
}

function Pagination({ params, page, pageCount }: { params: PageParams; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const link = "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800";
  const current = "rounded-md border border-zinc-900 bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-white dark:text-zinc-900 dark:border-zinc-100";
  const numbers = pageList(page, pageCount);
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-300">
      <div className="flex flex-wrap items-center gap-1">
        {page > 1 ? (
          <Link className={link} href={hrefWith(params, { page: String(page - 1) })}>
            ← Previous
          </Link>
        ) : null}
        {numbers.map((n, index) => {
          const gap = index > 0 && n - numbers[index - 1] > 1;
          return (
            <span key={n} className="flex items-center gap-1">
              {gap ? <span className="px-1 text-zinc-400">…</span> : null}
              <Link
                href={hrefWith(params, { page: n === 1 ? undefined : String(n) })}
                aria-current={n === page ? "page" : undefined}
                className={n === page ? current : link}
              >
                {n}
              </Link>
            </span>
          );
        })}
        {page < pageCount ? (
          <Link className={link} href={hrefWith(params, { page: String(page + 1) })}>
            Next →
          </Link>
        ) : null}
      </div>
      <form method="get" className="flex items-center gap-2">
        {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
        {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
        {params.sort ? <input type="hidden" name="sort" value={params.sort} /> : null}
        {params.dir ? <input type="hidden" name="dir" value={params.dir} /> : null}
        {params.flat ? <input type="hidden" name="flat" value={params.flat} /> : null}
        {params.showDismissed ? <input type="hidden" name="showDismissed" value={params.showDismissed} /> : null}
        <label className="flex items-center gap-2">
          Go to
          <input
            name="page"
            type="number"
            min={1}
            max={pageCount}
            defaultValue={page}
            aria-label="Page number"
            className="w-20 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
          />
        </label>
        <button type="submit" className={link}>
          Go
        </button>
      </form>
    </nav>
  );
}

function preferenceSummary(preferences: UserPreferences) {
  const titles = preferences.titles.include.slice(0, 3).join(", ") || "any title";
  const places = [
    ...preferences.locations.include.filter((item) => item.toLowerCase() !== "remote").slice(0, 2),
    ...(preferences.locations.remote_ok ? ["Remote"] : []),
  ].join(" or ");
  const pay = preferences.pay.min_usd ? `$${Math.round(preferences.pay.min_usd / 1000)}k+` : "any pay";
  return [titles, places || "any location", pay].join(" · ");
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const params = await searchParams;
  const userId = await requireApprovedUser();
  const profile = await getUserProfile(userId);
  if (!profile.onboarded) redirect("/onboarding");
  const preferences = profile.preferences;
  const grouped = preferences.group_duplicates && params.flat !== "1";
  const hideDismissedPref = params.showDismissed !== "1";
  const hideDismissed =
    hideDismissedPref && params.status !== "skipped" && params.status !== "not_qualified";
  const [result, counts] = await Promise.all([
    cachedMatchedJobs({
      userId,
      preferences,
      status: params.status,
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      page: Number(params.page) || 1,
      grouped,
      hideDismissed,
    }),
    jobCounts(),
  ]);
  const currentSort = parseJobSort(params.sort, params.dir);

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Job matches</h1>
            <p className="mt-2 rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              Looking for: {preferenceSummary(preferences)}
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {result.totalJobs} matching roles
              {grouped && result.totalGroups !== result.totalJobs ? ` (${result.totalGroups} groups)` : ""} ·{" "}
              {counts.jobCount} open jobs stored · {counts.liveCompanies} live boards.{" "}
              <Link
                className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
                href={hrefWith(params, { flat: grouped ? "1" : undefined, page: undefined })}
              >
                {grouped ? "Show a flat list" : "Group likely duplicates"}
              </Link>
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <input type="hidden" name="sort" value={currentSort.sort} />
            <input type="hidden" name="dir" value={currentSort.dir} />
            {params.flat ? <input type="hidden" name="flat" value={params.flat} /> : null}
            {params.showDismissed ? <input type="hidden" name="showDismissed" value={params.showDismissed} /> : null}
            <label className="flex flex-col gap-1 text-sm">
              Search
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Title, company, or location"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Status
              <select
                name="status"
                defaultValue={params.status ?? ""}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">All</option>
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {APPLICATION_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm text-white dark:text-zinc-900">
              Apply
            </button>
            <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
              {APPLICATION_STATUSES.map((status) => {
                const active = params.status === status;
                return (
                  <Link
                    key={status}
                    href={hrefWith(params, { status: active ? undefined : status, page: undefined })}
                    aria-current={active ? "true" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${APPLICATION_STATUS_CLASSES[status]} ${active ? "ring-2 ring-zinc-900 ring-offset-1 dark:ring-zinc-100 dark:ring-offset-zinc-900" : ""}`}
                  >
                    <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                    {APPLICATION_STATUS_LABELS[status]}
                    <span className="tabular-nums">{result.statusCounts[status]}</span>
                  </Link>
                );
              })}
            </div>
            <Link
              href={hrefWith(params, { showDismissed: hideDismissedPref ? "1" : undefined, page: undefined })}
              className="inline-flex items-center gap-2 pb-0.5 text-sm text-zinc-700 dark:text-zinc-300"
            >
              <span aria-hidden="true" className={`hide-check ${hideDismissedPref ? "is-on" : ""}`}>
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              Hide skipped and not qualified
            </Link>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {counts.jobCount === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 text-sm text-zinc-600 dark:text-zinc-400">
            <p>No jobs in the local database yet. From the project folder run:</p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-zinc-900 p-3 text-zinc-100 dark:bg-zinc-950 dark:text-zinc-100">
              {`npm run import-companies
npm run ingest -- --limit 40`}
            </pre>
            <p className="mt-3">
              Full ingest (thousands of boards) can take hours. Use <code>--limit</code> first.
            </p>
          </div>
        ) : result.totalJobs === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No rows match your current filters or status. Stored open jobs: {counts.jobCount}.
          </p>
        ) : (
          <form>
            {grouped ? (
              <div className="mb-2 flex items-center justify-end gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span>Two separate rows are really one job?</span>
                <button
                  type="submit"
                  formAction={markDuplicate}
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Mark selected as the same job
                </button>
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-800 text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                  <tr>
                    {grouped ? <th className="px-2 py-2" aria-label="Select" /> : null}
                    <SortHeader label="Title" column="title" params={params} />
                    <SortHeader label="Company" column="company" params={params} />
                    <SortHeader label="Location" column="location" params={params} />
                    <SortHeader label="Pay" column="pay" params={params} />
                    <SortHeader label="Posted" column="posted" params={params} />
                    <SortHeader label="Score" column="score" params={params} />
                    <SortHeader label="Status" column="status" params={params} />
                  </tr>
                </thead>
                <tbody>
                  <AnimatedJobGroups groups={result.groups} grouped={grouped} hideDismissed={hideDismissed} />
                </tbody>
              </table>
            </div>
          </form>
        )}
        {result.truncated ? (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Showing matches from the newest {CANDIDATE_CAP.toLocaleString()} candidate jobs; narrow your
            filters to see older ones.
          </p>
        ) : null}
        <Pagination params={params} page={result.page} pageCount={result.pageCount} />
      </main>
    </div>
  );
}
