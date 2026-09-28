/** Server Component for `/`: SSR the ranked job table from SQLite on every request. */
import Link from "next/link";
import {
  APPLICATION_STATUS_CLASSES,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_ROW_CLASSES,
  APPLICATION_STATUSES,
} from "@/lib/constants";
import {
  defaultJobSortDir,
  formatPay,
  formatPostedDate,
  jobCounts,
  listMatchedJobs,
  parseJobSort,
  type JobSortColumn,
  type JobSortDir,
} from "@/lib/jobs-query";
import { StatusSelect } from "./status-select";

export const dynamic = "force-dynamic";

function sortHref(
  params: { q?: string; status?: string; sort?: string; dir?: string },
  column: JobSortColumn,
) {
  const current = parseJobSort(params.sort, params.dir);
  const nextDir: JobSortDir =
    current.sort === column
      ? current.dir === "asc"
        ? "desc"
        : "asc"
      : defaultJobSortDir(column);
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  search.set("sort", column);
  search.set("dir", nextDir);
  return `/?${search.toString()}`;
}

function SortHeader({
  label,
  column,
  params,
}: {
  label: string;
  column: JobSortColumn;
  params: { q?: string; status?: string; sort?: string; dir?: string };
}) {
  const current = parseJobSort(params.sort, params.dir);
  const active = current.sort === column;
  return (
    <th
      className="px-3 py-2"
      aria-sort={
        active ? (current.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <Link
        href={sortHref(params, column)}
        className={`inline-flex items-center gap-1 hover:text-zinc-900 ${
          active ? "text-zinc-900" : ""
        }`}
      >
        {label}
        <span className="text-[10px] text-zinc-500" aria-hidden="true">
          {active ? (current.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </Link>
    </th>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const matches = listMatchedJobs({
    status: params.status,
    q: params.q,
    sort: params.sort,
    dir: params.dir,
  });
  const counts = jobCounts();
  const currentSort = parseJobSort(params.sort, params.dir);

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Job matches</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {matches.length} matching roles · {counts.jobCount} stored ·{" "}
              {counts.liveCompanies} live boards. Filters come from{" "}
              <code className="rounded bg-zinc-100 px-1">search.config.yaml</code>.
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <input type="hidden" name="sort" value={currentSort.sort} />
            <input type="hidden" name="dir" value={currentSort.dir} />
            <label className="flex flex-col gap-1 text-sm">
              Search
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Title or company"
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
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white"
            >
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
              Full ingest (thousands of boards) can take hours. Use{" "}
              <code>--limit</code> first.
            </p>
          </div>
        ) : matches.length === 0 ? (
          <p className="text-sm text-zinc-600">
            No rows match the current YAML filters or status. Stored jobs:{" "}
            {counts.jobCount}.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
                <tr>
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
                {matches.map((job) => (
                  <tr
                    key={`${job.atsProvider}-${job.boardSlug}-${job.externalId}`}
                    className={`border-t border-zinc-100 ${APPLICATION_STATUS_ROW_CLASSES[job.status]}`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                      >
                        {job.title}
                      </Link>
                      <div className="mt-1 text-xs text-zinc-500">
                        {job.atsProvider}
                        {job.skillsMatched.length
                          ? ` · ${job.skillsMatched.slice(0, 4).join(", ")}`
                          : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">{job.companyName}</td>
                    <td className="px-3 py-2">
                      {job.location ?? "—"}
                      {job.isRemote ? (
                        <span className="ml-1 text-xs text-zinc-500">remote</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{formatPay(job)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-700">
                      {formatPostedDate(job)}
                    </td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
