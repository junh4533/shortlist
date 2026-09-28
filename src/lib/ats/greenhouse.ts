/** Greenhouse job board API: one call returns every job with HTML content. */
import { stripHtml } from "../html";
import { inferRemote } from "../match";
import { asRecord, isValidJob, withSalary } from "./common";
import { getJson } from "./http";
import type { AtsAdapter, FetchedJob } from "./types";

export function greenhouseApiUrl(slug: string) {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
}

/** Greenhouse `{ jobs: [...] }` → FetchedJob[]. Null if the payload is the wrong shape. */
export function mapGreenhouse(data: unknown): FetchedJob[] | null {
  const jobs = asRecord(data).jobs;
  if (!Array.isArray(jobs)) return null;
  return jobs.flatMap((raw) => {
    const job = asRecord(raw);
    const content = stripHtml(typeof job.content === "string" ? job.content : "");
    const locationName = asRecord(job.location).name;
    const location = locationName != null ? String(locationName) : null;
    const departments = Array.isArray(job.departments)
      ? job.departments
          .map((dept) => String(asRecord(dept).name ?? ""))
          .filter(Boolean)
          .join(", ")
      : null;
    const remote = inferRemote(location, content);
    const mapped = {
      externalId: String(job.id ?? ""),
      title: String(job.title ?? ""),
      department: departments || null,
      location,
      cleanText: content,
      url: String(job.absolute_url ?? ""),
      isRemote: remote,
      workplaceType: remote ? "remote" : null,
      postedAt: typeof job.first_published === "string" ? job.first_published : null,
      updatedAt: typeof job.updated_at === "string" ? job.updated_at : null,
    };
    return isValidJob(mapped) ? [withSalary(mapped)] : [];
  });
}

export const greenhouse: AtsAdapter = {
  provider: "greenhouse",
  boardUrl: (slug) => `https://job-boards.greenhouse.io/${slug}`,
  async fetchBoard(slug, ctx) {
    const response = await getJson(greenhouseApiUrl(slug), ctx.userAgent);
    if (response.kind !== "ok") return { ok: false, reason: response.kind, status: response.status };
    const jobs = mapGreenhouse(response.data);
    return jobs ? { ok: true, jobs } : { ok: false, reason: "dead", status: response.status };
  },
};
