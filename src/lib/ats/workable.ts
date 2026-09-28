/** Workable widget API (`apply.workable.com/api/v1/widget/accounts/{slug}?details=true`). Rate limits aggressively. */
import { stripHtml } from "../html";
import { asRecord, asString, isValidJob, joinParts, toIso, withSalary } from "./common";
import { getJson } from "./http";
import type { AtsAdapter, FetchedJob } from "./types";

export function workableApiUrl(slug: string) {
  return `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`;
}

function locationText(job: Record<string, unknown>) {
  const locations = Array.isArray(job.locations) ? job.locations.map(asRecord) : [];
  const visible = locations.filter((location) => location.hidden !== true);
  if (visible.length) {
    return visible
      .map((location) =>
        joinParts([asString(location.city), asString(location.region), asString(location.country)]),
      )
      .filter(Boolean)
      .join(" | ");
  }
  return joinParts([asString(job.city), asString(job.state), asString(job.country)]);
}

/** Workable `{ name, jobs: [...] }` → FetchedJob[]. */
export function mapWorkable(data: unknown): FetchedJob[] | null {
  const jobs = asRecord(data).jobs;
  if (!Array.isArray(jobs)) return null;
  return jobs.flatMap((raw) => {
    const job = asRecord(raw);
    const remote = job.telecommuting === true;
    const shortcode = asString(job.shortcode) ?? "";
    const mapped = {
      externalId: shortcode,
      title: asString(job.title) ?? "",
      department: asString(job.department),
      location: locationText(job) || (remote ? "Remote" : null),
      cleanText: stripHtml(asString(job.description) ?? ""),
      url:
        asString(job.url) ??
        asString(job.shortlink) ??
        (shortcode ? `https://apply.workable.com/j/${shortcode}` : ""),
      isRemote: remote,
      workplaceType: remote ? "remote" : null,
      postedAt: toIso(job.published_on) ?? toIso(job.created_at),
      updatedAt: toIso(job.published_on),
    };
    return isValidJob(mapped) ? [withSalary(mapped)] : [];
  });
}

export const workable: AtsAdapter = {
  provider: "workable",
  boardUrl: (slug) => `https://apply.workable.com/${slug}`,
  async fetchBoard(slug, ctx) {
    const response = await getJson(workableApiUrl(slug), ctx.userAgent);
    if (response.kind !== "ok") return { ok: false, reason: response.kind, status: response.status };
    const jobs = mapWorkable(response.data);
    if (!jobs) return { ok: false, reason: "dead", status: response.status };
    // An account with no postings is indistinguishable from a stale slug until it has been live.
    if (jobs.length === 0 && !ctx.previouslyLive) return { ok: false, reason: "dead" };
    return { ok: true, jobs };
  },
};
