/** Application-status values and Tailwind classes for the table UI. */
export const APPLICATION_STATUSES = [
  "new",
  "interested",
  "applied",
  "interviewing",
  "offered",
  "rejected",
  "not_qualified",
  "skipped",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Higher = further along; used to pick a status when merging duplicates. */
export const STATUS_PRIORITY: Record<ApplicationStatus, number> = {
  offered: 7,
  interviewing: 6,
  applied: 5,
  interested: 4,
  rejected: 3,
  not_qualified: 2,
  skipped: 1,
  new: 0,
};

export function statusPriority(status: string) {
  return STATUS_PRIORITY[status as ApplicationStatus] ?? 0;
}

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "New",
  interested: "Interested",
  applied: "Applied",
  interviewing: "Interviewing",
  offered: "Offered",
  rejected: "Rejected",
  not_qualified: "Not qualified",
  skipped: "Skipped",
};

export const APPLICATION_STATUS_CLASSES: Record<ApplicationStatus, string> = {
  new: "bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600",
  interested: "bg-sky-100 text-sky-950 border-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-800",
  applied: "bg-indigo-100 text-indigo-950 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-100 dark:border-indigo-800",
  interviewing: "bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800",
  offered: "bg-emerald-100 text-emerald-950 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800",
  rejected: "bg-red-100 text-red-950 border-red-300 dark:bg-red-950 dark:text-red-100 dark:border-red-800",
  not_qualified: "bg-orange-100 text-orange-950 border-orange-300 dark:bg-orange-950 dark:text-orange-100 dark:border-orange-800",
  skipped: "bg-stone-200 text-stone-800 border-stone-400 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-600",
};

export const APPLICATION_STATUS_ROW_CLASSES: Record<ApplicationStatus, string> = {
  new: "",
  interested: "bg-sky-50/80 dark:bg-sky-950/40",
  applied: "bg-indigo-50/80 dark:bg-indigo-950/40",
  interviewing: "bg-amber-50/80 dark:bg-amber-950/30",
  offered: "bg-emerald-50/80 dark:bg-emerald-950/30",
  rejected: "bg-red-50/70 dark:bg-red-950/30",
  not_qualified: "bg-orange-50/80 dark:bg-orange-950/30",
  skipped: "bg-stone-50 dark:bg-stone-900/40",
};
