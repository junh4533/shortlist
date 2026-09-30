/** Display helpers safe to import from client components. */

export function formatPay(job: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryUnknown: boolean;
}) {
  if (job.salaryUnknown || (job.salaryMin == null && job.salaryMax == null)) {
    return "Unknown";
  }
  const money = (value: number) => `$${Math.round(value / 1000)}k`;
  if (job.salaryMin != null && job.salaryMax != null && job.salaryMin !== job.salaryMax) {
    return `${money(job.salaryMin)}–${money(job.salaryMax)}`;
  }
  return money(job.salaryMax ?? job.salaryMin ?? 0);
}

export function formatPostedDate(job: { postedAt: string | null; updatedAt: string | null }) {
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
