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
  new: "bg-zinc-100 text-zinc-800 border-zinc-300",
  interested: "bg-sky-100 text-sky-950 border-sky-300",
  applied: "bg-indigo-100 text-indigo-950 border-indigo-300",
  interviewing: "bg-amber-100 text-amber-950 border-amber-400",
  offered: "bg-emerald-100 text-emerald-950 border-emerald-400",
  rejected: "bg-red-100 text-red-950 border-red-300",
  not_qualified: "bg-orange-100 text-orange-950 border-orange-300",
  skipped: "bg-stone-200 text-stone-800 border-stone-400",
};

export const APPLICATION_STATUS_ROW_CLASSES: Record<ApplicationStatus, string> = {
  new: "",
  interested: "bg-sky-50/80",
  applied: "bg-indigo-50/80",
  interviewing: "bg-amber-50/80",
  offered: "bg-emerald-50/80",
  rejected: "bg-red-50/70",
  not_qualified: "bg-orange-50/80",
  skipped: "bg-stone-50",
};
