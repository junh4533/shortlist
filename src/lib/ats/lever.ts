/** Lever postings API: a bare JSON array. Site names are case-sensitive. */
import { stripHtml } from "../html";
import { inferRemote } from "../match";
import { asRecord, isValidJob, toIso, withSalary } from "./common";
import { getJson } from "./http";
import type { AtsAdapter, FetchedJob } from "./types";

export function leverApiUrl(slug: string) {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
}

/** Lever JSON array → FetchedJob[]. */
export function mapLever(data: unknown): FetchedJob[] | null {
  if (!Array.isArray(data)) return null;
  return data.flatMap((raw) => {
    const job = asRecord(raw);
    const categories = asRecord(job.categories);
    const location = categories.location ? String(categories.location) : null;
    const text =
      typeof job.descriptionPlain === "string"
        ? job.descriptionPlain
        : stripHtml(typeof job.description === "string" ? job.description : "");
    const salaryRange = asRecord(job.salaryRange);
    const workplace = typeof job.workplaceType === "string" ? job.workplaceType.toLowerCase() : null;
    const remote = workplace === "remote" || inferRemote(location, text);
    const mapped = {
      externalId: String(job.id ?? ""),
      title: String(job.text ?? ""),
      department: categories.team ? String(categories.team) : null,
      location,
      cleanText: text,
      url: String(job.hostedUrl ?? job.applyUrl ?? ""),
      isRemote: remote,
      workplaceType: remote ? "remote" : workplace && workplace !== "unspecified" ? workplace : null,
      postedAt: toIso(job.createdAt),
      updatedAt: toIso(job.updatedAt),
    };
    if (!isValidJob(mapped)) return [];
    return [
      withSalary(
        mapped,
        typeof salaryRange.min === "number" ? salaryRange.min : null,
        typeof salaryRange.max === "number" ? salaryRange.max : null,
      ),
    ];
  });
}

export const lever: AtsAdapter = {
  provider: "lever",
  boardUrl: (slug) => `https://jobs.lever.co/${slug}`,
  async fetchBoard(slug, ctx) {
    const response = await getJson(leverApiUrl(slug), ctx.userAgent);
    if (response.kind !== "ok") return { ok: false, reason: response.kind, status: response.status };
    const jobs = mapLever(response.data);
    return jobs ? { ok: true, jobs } : { ok: false, reason: "dead", status: response.status };
  },
};
