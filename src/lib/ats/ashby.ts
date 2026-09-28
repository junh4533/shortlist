/** Ashby posting API (`posting-api/job-board/{slug}`), with compensation. */
import { stripHtml } from "../html";
import { asRecord, isValidJob, withSalary } from "./common";
import { getJson } from "./http";
import type { AtsAdapter, FetchedJob } from "./types";

export function ashbyApiUrl(slug: string) {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`;
}

function ashbyCompensation(job: Record<string, unknown>) {
  const components = asRecord(job.compensation).summaryComponents;
  const salary = Array.isArray(components)
    ? components
        .map(asRecord)
        .find(
          (component) =>
            component.compensationType === "Salary" || component.interval === "1 YEAR",
        )
    : undefined;
  return {
    min: typeof salary?.minValue === "number" ? salary.minValue : null,
    max: typeof salary?.maxValue === "number" ? salary.maxValue : null,
  };
}

/** Ashby `{ jobs: [...] }` → FetchedJob[] (skips unlisted postings). */
export function mapAshby(data: unknown): FetchedJob[] | null {
  const jobs = asRecord(data).jobs;
  if (!Array.isArray(jobs)) return null;
  return jobs.flatMap((raw) => {
    const job = asRecord(raw);
    if (job.isListed === false) return [];
    const location =
      (typeof job.location === "string" && job.location) ||
      (typeof job.locationName === "string" && job.locationName) ||
      null;
    const text =
      typeof job.descriptionPlain === "string"
        ? job.descriptionPlain
        : stripHtml(
            typeof job.descriptionHtml === "string"
              ? job.descriptionHtml
              : typeof job.description === "string"
                ? job.description
                : "",
          );
    const workplace =
      typeof job.workplaceType === "string" ? job.workplaceType.toLowerCase() : null;
    const pay = ashbyCompensation(job);
    const mapped = {
      externalId: String(job.id ?? ""),
      title: String(job.title ?? ""),
      department: typeof job.department === "string" ? job.department : null,
      location,
      cleanText: text,
      url: String(job.jobUrl ?? job.applyUrl ?? ""),
      isRemote: workplace === "remote",
      workplaceType: workplace,
      postedAt: typeof job.publishedAt === "string" ? job.publishedAt : null,
      updatedAt: typeof job.publishedAt === "string" ? job.publishedAt : null,
    };
    return isValidJob(mapped) ? [withSalary(mapped, pay.min, pay.max)] : [];
  });
}

export const ashby: AtsAdapter = {
  provider: "ashby",
  boardUrl: (slug) => `https://jobs.ashbyhq.com/${slug}`,
  async fetchBoard(slug, ctx) {
    const response = await getJson(ashbyApiUrl(slug), ctx.userAgent);
    if (response.kind !== "ok") return { ok: false, reason: response.kind, status: response.status };
    const jobs = mapAshby(response.data);
    return jobs ? { ok: true, jobs } : { ok: false, reason: "dead", status: response.status };
  },
};
