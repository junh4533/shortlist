"use client";

/** One job row, plus its duplicate-group header. Details collapse after the status leaves New. */
import Link from "next/link";
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_ROW_CLASSES,
  STATUS_PRIORITY,
  type ApplicationStatus,
} from "@/lib/constants";
import { formatPay, formatPostedDate } from "@/lib/jobs/format";
import type { JobGroup, ListedJob } from "@/lib/jobs/query";
import { markNotDuplicate } from "./actions";
import { exitState, hasOverride, jobStatusKey, liveStatus, useStatusVersion } from "./job-status";
import { StatusSelect } from "./status-select";

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
  high: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800",
  medium: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800",
  low: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600",
  manual: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-800",
};

function isDismissed(status: ApplicationStatus) {
  return status === "not_qualified" || status === "skipped";
}

function siblingHint(group: JobGroup, job: ListedJob, statusOf: (job: ListedJob) => ApplicationStatus) {
  const rows = [group.primary, ...group.members];
  const advanced = rows.find((row) => {
    const status = statusOf(row);
    return row !== job && STATUS_PRIORITY[status] >= STATUS_PRIORITY.applied && status !== "rejected";
  });
  const status = statusOf(job);
  if (!advanced || STATUS_PRIORITY[status] >= STATUS_PRIORITY.applied) return null;
  const verb = APPLICATION_STATUS_LABELS[statusOf(advanced)].toLowerCase();
  return `You ${verb === "applied" ? "applied" : `marked "${verb}"`} via ${PROVIDER_LABELS[advanced.atsProvider] ?? advanced.atsProvider}`;
}

function JobRow({
  job,
  status,
  group,
  indented,
  grouped,
  hideDismissed,
  statusOf,
}: {
  job: ListedJob;
  status: ApplicationStatus;
  group: JobGroup;
  indented: boolean;
  grouped: boolean;
  hideDismissed: boolean;
  statusOf: (job: ListedJob) => ApplicationStatus;
}) {
  const hint = group.members.length ? siblingHint(group, job, statusOf) : null;
  const collapsed = status !== "new";
  const leaving =
    exitState(jobStatusKey(job.atsProvider, job.boardSlug, job.externalId)) === "leaving";
  return (
    <tr
      className={`border-t border-zinc-100 dark:border-zinc-800 ${APPLICATION_STATUS_ROW_CLASSES[status]} ${leaving ? "row-leave pointer-events-none" : ""}`}
    >
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
          className="font-medium text-zinc-900 dark:text-zinc-100 underline-offset-2 hover:underline"
        >
          {job.title}
        </Link>
        {collapsed ? null : (
          <>
            {job.snippet ? <p className="mt-1 line-clamp-2 max-w-xl text-xs text-zinc-500 dark:text-zinc-400">{job.snippet}</p> : null}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                {PROVIDER_LABELS[job.atsProvider] ?? job.atsProvider}
              </span>
              {job.skillsMatched.length ? <span>{job.skillsMatched.slice(0, 4).join(", ")}</span> : null}
            </div>
          </>
        )}
        {hint || indented ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {hint ? <span className="text-indigo-700 dark:text-indigo-300">{hint}</span> : null}
            {indented ? (
              <button
                type="submit"
                formAction={markNotDuplicate}
                name="pair"
                value={`${group.primary.jobKey}~${job.jobKey}`}
                className="text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Not the same job
              </button>
            ) : null}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2">{job.companyName}</td>
      <td className="px-3 py-2">
        {job.location ?? "—"}
        {job.isRemote ? <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">remote</span> : null}
      </td>
      <td className="px-3 py-2">{formatPay(job)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">{formatPostedDate(job)}</td>
      <td className="px-3 py-2">{job.rankScore}</td>
      <td className="px-3 py-2">
        <StatusSelect
          atsProvider={job.atsProvider}
          boardSlug={job.boardSlug}
          externalId={job.externalId}
          status={job.status}
          title={job.title}
          hideDismissed={hideDismissed}
        />
      </td>
    </tr>
  );
}

function GroupHeader({ group, columns }: { group: JobGroup; columns: number }) {
  const platforms = new Set([group.primary, ...group.members].map((row) => row.atsProvider)).size;
  const count = group.members.length + 1;
  return (
    <tr className="border-t-2 border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <td colSpan={columns} className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
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
        {group.reason ? <span className="ml-2 text-zinc-500 dark:text-zinc-400">{group.reason}</span> : null}
      </td>
    </tr>
  );
}

function shouldKeep(group: JobGroup) {
  const jobs = [group.primary, ...group.members];
  return jobs.some((job) => {
    const key = jobStatusKey(job.atsProvider, job.boardSlug, job.externalId);
    if (exitState(key) === "leaving") return true;
    return hasOverride(key) && !isDismissed(liveStatus(key, job.status));
  });
}

const heldGroups = new Map<string, JobGroup>();
let groupOrder: string[] = [];

function mergedGroups(groups: JobGroup[]) {
  for (const group of groups) heldGroups.set(group.id, group);
  const incoming = new Map(groups.map((group) => [group.id, group]));
  const next: JobGroup[] = [];
  const used = new Set<string>();
  for (const id of groupOrder) {
    const current = incoming.get(id);
    if (current) {
      next.push(current);
      used.add(id);
      continue;
    }
    const saved = heldGroups.get(id);
    if (saved && shouldKeep(saved)) {
      next.push(saved);
      used.add(id);
    }
  }
  for (const group of groups) {
    if (!used.has(group.id)) next.push(group);
  }
  groupOrder = next.map((group) => group.id);
  for (const id of [...heldGroups.keys()]) {
    if (!groupOrder.includes(id)) heldGroups.delete(id);
  }
  return next;
}

/** Keeps a row in place while its exit animation finishes, even if the server list already dropped it. */
export function AnimatedJobGroups({
  groups,
  grouped,
  hideDismissed,
}: {
  groups: JobGroup[];
  grouped: boolean;
  hideDismissed: boolean;
}) {
  useStatusVersion();
  const next = mergedGroups(groups);
  return next.map((group) => (
    <JobGroupRows key={group.id} group={group} grouped={grouped} hideDismissed={hideDismissed} />
  ));
}

export function JobGroupRows({
  group,
  grouped,
  hideDismissed,
}: {
  group: JobGroup;
  grouped: boolean;
  hideDismissed: boolean;
}) {
  useStatusVersion();
  const jobs = [group.primary, ...group.members];
  const statusOf = (job: ListedJob) =>
    liveStatus(jobStatusKey(job.atsProvider, job.boardSlug, job.externalId), job.status);
  const visible = jobs.filter((job) => {
    if (!(hideDismissed && isDismissed(statusOf(job)))) return true;
    const key = jobStatusKey(job.atsProvider, job.boardSlug, job.externalId);
    return exitState(key) !== "gone";
  });
  if (!visible.length) return null;
  const columns = grouped ? 8 : 7;
  const showHeader = grouped && visible.length > 1;
  return (
    <>
      {showHeader ? <GroupHeader group={group} columns={columns} /> : null}
      {visible.map((job, index) => (
        <JobRow
          key={job.jobKey}
          job={job}
          status={statusOf(job)}
          group={group}
          indented={showHeader && index > 0}
          grouped={grouped}
          hideDismissed={hideDismissed}
          statusOf={statusOf}
        />
      ))}
    </>
  );
}
