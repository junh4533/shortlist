/** Server Component for `/`: SSR the ranked job table (grouped likely duplicates, paginated) on every request. */
import Link from "next/link";
import {
  APPLICATION_STATUS_CLASSES,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_ROW_CLASSES,
  APPLICATION_STATUSES,
  STATUS_PRIORITY,
} from "@/lib/constants";
import { getCurrentUserId } from "@/lib/current-user";
import {
  CANDIDATE_CAP,
  defaultJobSortDir,
  formatPay,
  formatPostedDate,
  jobCounts,
  parseJobSort,
  type JobGroup,
  type JobSortColumn,
  type JobSortDir,
  type ListedJob,
} from "@/lib/jobs/query";
import { redirect } from "next/navigation";
import type { UserPreferences } from "@/lib/config";
import { cachedMatchedJobs } from "@/lib/jobs/cached";
import { getUserProfile } from "@/lib/preferences-store";
import { markDuplicate, markNotDuplicate } from "./actions";
import { StatusSelect } from "./status-select";

export const dynamic = "force-dynamic";

type PageParams = {
  q?: string;
  status?: string;
  sort?: string;
  dir?: string;
  page?: string;
  flat?: string;
};

const PROVIDER_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  recruitee: "Recruitee",
  bamboohr: "BambooHR",
};

const CONFIDENCE_CLASSES: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-900 border-emerald-300",
  medium: "bg-amber-100 text-amber-900 border-amber-300",
  low: "bg-zinc-100 text-zinc-700 border-zinc-300",
  manual: "bg-sky-100 text-sky-900 border-sky-300",
};

function hrefWith(params: PageParams, changes: Partial<PageParams>) {
  const merged = { ...params, ...changes };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/?${query}` : "/";
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
        className={`inline-flex items-center gap-1 hover:text-zinc-900 ${active ? "text-zinc-900" : ""}`}
      >
        {label}
        <span className="text-[10px] text-zinc-500" aria-hidden="true">
          {active ? (current.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </Link>
    </th>
  );
}

function Pagination({ params, page, pageCount }: { params: PageParams; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const link = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-100";
  return (
    <nav className="mt-4 flex items-center justify-between text-sm text-zinc-700">
      {page > 1 ? (
        <Link className={link} href={hrefWith(params, { page: String(page - 1) })}>
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link className={link} href={hrefWith(params, { page: String(page + 1) })}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** "You applied via Greenhouse" for rows whose sibling in the group is already applied or further. */
function siblingHint(group: JobGroup, job: ListedJob) {
  const rows = [group.primary, ...group.members];
  const advanced = rows.find(
    (row) => row !== job && STATUS_PRIORITY[row.status] >= STATUS_PRIORITY.applied && row.status !== "rejected",
  );
  if (!advanced || STATUS_PRIORITY[job.status] >= STATUS_PRIORITY.applied) return null;
  const verb = APPLICATION_STATUS_LABELS[advanced.status].toLowerCase();
  return `You ${verb === "applied" ? "applied" : `marked "${verb}"`} via ${PROVIDER_LABELS[advanced.atsProvider] ?? advanced.atsProvider}`;
}

function JobRow({
  job,
  group,
  indented,
  grouped,
}: {
  job: ListedJob;
  group: JobGroup;
  indented: boolean;
  grouped: boolean;
}) {
  const hint = group.members.length ? siblingHint(group, job) : null;
  return (
    <tr className={`border-t border-zinc-100 ${APPLICATION_STATUS_ROW_CLASSES[job.status]}`}>
      {grouped ? (
        <td className="px-2 py-2 align-top">
          <input
            type="checkbox"
            name="merge"
            value={job.jobKey}
            aria-label={`Select ${job.title} to mark as the same job`}
            className="mt-1"
          />
        </td>
      ) : null}
      <td className={`px-3 py-2 ${indented ? "pl-8" : ""}`}>
        {indented ? <span className="mr-1 text-zinc-400">↳</span> : null}
        <Link
          href={job.url}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline"
        >
          {job.title}
        </Link>
        {job.snippet ? <p className="mt-1 line-clamp-2 max-w-xl text-xs text-zinc-500">{job.snippet}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
          <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-medium text-zinc-700">
            {PROVIDER_LABELS[job.atsProvider] ?? job.atsProvider}
          </span>
          {job.skillsMatched.length ? <span>{job.skillsMatched.slice(0, 4).join(", ")}</span> : null}
          {hint ? <span className="text-indigo-700">{hint}</span> : null}
          {indented ? (
            <button
              type="submit"
              formAction={markNotDuplicate}
              name="pair"
              value={`${group.primary.jobKey}~${job.jobKey}`}
              className="text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
            >
              Not the same job
            </button>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2">{job.companyName}</td>
      <td className="px-3 py-2">
        {job.location ?? "—"}
        {job.isRemote ? <span className="ml-1 text-xs text-zinc-500">remote</span> : null}
      </td>
      <td className="px-3 py-2">{formatPay(job)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-zinc-700">{formatPostedDate(job)}</td>
      <td className="px-3 py-2">{job.rankScore}</td>
      <td className="px-3 py-2">
        <StatusSelect
          atsProvider={job.atsProvider}
          boardSlug={job.boardSlug}
          externalId={job.externalId}
          status={job.status}
        />
      </td>
    </tr>
  );
}

function GroupHeader({ group, columns }: { group: JobGroup; columns: number }) {
  const platforms = new Set([group.primary, ...group.members].map((row) => row.atsProvider)).size;
  const count = group.members.length + 1;
  return (
    <tr className="border-t-2 border-zinc-200 bg-zinc-50">
      <td colSpan={columns} className="px-3 py-1.5 text-xs text-zinc-600">
        <span className="font-medium text-zinc-800">
          Likely the same job {platforms > 1 ? `on ${platforms} platforms` : `(${count} listings)`}
        </span>
        {group.confidence ? (
          <span
            title={group.reason ?? undefined}
            className={`ml-2 rounded-full border px-2 py-0.5 font-medium ${CONFIDENCE_CLASSES[group.confidence]}`}
          >
            {group.confidence === "manual" ? "marked by you" : `${group.confidence} confidence`}
          </span>
        ) : null}
        {group.reason ? <span className="ml-2 text-zinc-500">{group.reason}</span> : null}
      </td>
    </tr>
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

export default async function Home({ searchParams }: { searchParams: Promise<PageParams> }) {
  const params = await searchParams;
  const userId = await getCurrentUserId();
  const profile = await getUserProfile(userId);
  if (!profile.onboarded) redirect("/onboarding");
  const preferences = profile.preferences;
  const grouped = preferences.group_duplicates && params.flat !== "1";
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
    }),
    jobCounts(),
  ]);
  const currentSort = parseJobSort(params.sort, params.dir);
  const columns = grouped ? 8 : 7;

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
          <div>
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-2xl font-semibold tracking-tight">Job matches</h1>
              <Link
                href="/settings"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
              >
                Settings
              </Link>
            </div>
            <p className="mt-2 rounded-md bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700">
              Looking for: {preferenceSummary(preferences)}
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              {result.totalJobs} matching roles
              {grouped && result.totalGroups !== result.totalJobs ? ` (${result.totalGroups} groups)` : ""} ·{" "}
              {counts.jobCount} open jobs stored · {counts.liveCompanies} live boards.{" "}
              <Link
                className="underline underline-offset-2 hover:text-zinc-900"
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
            <label className="flex flex-col gap-1 text-sm">
              Search
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Title, company, or location"
                className="rounded-md border border-zinc-300 px-3 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Status
              <select
                name="status"
                defaultValue={params.status ?? ""}
                className="rounded-md border border-zinc-300 px-3 py-1.5"
              >
                <option value="">All</option>
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {APPLICATION_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white">
              Apply
            </button>
            <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
              {APPLICATION_STATUSES.map((status) => (
                <span
                  key={status}
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${APPLICATION_STATUS_CLASSES[status]}`}
                >
                  {APPLICATION_STATUS_LABELS[status]}
                </span>
              ))}
            </div>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {counts.jobCount === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-600">
            <p>No jobs in the local database yet. From the project folder run:</p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-zinc-900 p-3 text-zinc-100">
              {`npm run import-companies
npm run ingest -- --limit 40`}
            </pre>
            <p className="mt-3">
              Full ingest (thousands of boards) can take hours. Use <code>--limit</code> first.
            </p>
          </div>
        ) : result.totalJobs === 0 ? (
          <p className="text-sm text-zinc-600">
            No rows match your current filters or status. Stored open jobs: {counts.jobCount}.
          </p>
        ) : (
          <form>
            {grouped ? (
              <div className="mb-2 flex items-center justify-end gap-2 text-xs text-zinc-600">
                <span>Two separate rows are really one job?</span>
                <button
                  type="submit"
                  formAction={markDuplicate}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 hover:bg-zinc-100"
                >
                  Mark selected as the same job
                </button>
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
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
                  {result.groups.map((group) =>
                    group.members.length ? (
                      [
                        <GroupHeader key={`${group.id}-header`} group={group} columns={columns} />,
                        <JobRow key={group.primary.jobKey} job={group.primary} group={group} indented={false} grouped={grouped} />,
                        ...group.members.map((member) => (
                          <JobRow key={member.jobKey} job={member} group={group} indented grouped={grouped} />
                        )),
                      ]
                    ) : (
                      <JobRow key={group.primary.jobKey} job={group.primary} group={group} indented={false} grouped={grouped} />
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </form>
        )}
        {result.truncated ? (
          <p className="mt-3 text-xs text-zinc-500">
            Showing matches from the newest {CANDIDATE_CAP.toLocaleString()} candidate jobs; narrow your
            filters to see older ones.
          </p>
        ) : null}
        <Pagination params={params} page={result.page} pageCount={result.pageCount} />
      </main>
    </div>
  );
}
