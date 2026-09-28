/** BambooHR careers API: list at `/careers/list`, description and date at `/careers/{id}/detail`. */
import { mapPool } from "../concurrency";
import { stripHtml } from "../html";
import { inferRemote } from "../match";
import { asRecord, asString, isValidJob, joinParts, toIso, withSalary } from "./common";
import { getJson } from "./http";
import type { AtsAdapter, FetchedJob } from "./types";

export function bambooListUrl(slug: string) {
  return `https://${encodeURIComponent(slug)}.bamboohr.com/careers/list`;
}

export function bambooDetailUrl(slug: string, id: string) {
  return `https://${encodeURIComponent(slug)}.bamboohr.com/careers/${encodeURIComponent(id)}/detail`;
}

/** BambooHR locationType: "0" on-site, "1" remote, "2" hybrid. */
function workplaceFrom(locationType: unknown, isRemote: unknown) {
  if (isRemote === true || locationType === "1") return "remote";
  if (locationType === "2") return "hybrid";
  if (locationType === "0") return "onsite";
  return null;
}

/** One list entry (+ optional detail) → FetchedJob. */
export function mapBambooJob(slug: string, raw: unknown, detail?: unknown): FetchedJob | null {
  const job = asRecord(raw);
  const opening = asRecord(asRecord(asRecord(detail).result).jobOpening);
  const id = asString(job.id) ?? "";
  const listLocation = asRecord(job.location);
  const atsLocation = asRecord(job.atsLocation);
  const detailLocation = asRecord(opening.location);
  const location = joinParts([
    asString(listLocation.city) ?? asString(atsLocation.city),
    asString(listLocation.state) ?? asString(atsLocation.state),
    asString(detailLocation.addressCountry) ?? asString(atsLocation.country),
  ]);
  const text = [stripHtml(asString(opening.description) ?? ""), asString(opening.compensation)]
    .filter(Boolean)
    .join("\n\n");
  const workplace = workplaceFrom(job.locationType, job.isRemote);
  const remote = workplace === "remote" || inferRemote(location, text);
  const mapped = {
    externalId: id,
    title: asString(job.jobOpeningName) ?? "",
    department: asString(job.departmentLabel),
    location: location ?? (remote ? "Remote" : null),
    cleanText: text,
    url: id ? `https://${slug}.bamboohr.com/careers/${id}` : "",
    isRemote: remote,
    workplaceType: remote ? "remote" : workplace,
    postedAt: toIso(opening.datePosted),
    updatedAt: toIso(opening.datePosted),
  };
  return isValidJob(mapped) ? withSalary(mapped) : null;
}

export const bamboohr: AtsAdapter = {
  provider: "bamboohr",
  boardUrl: (slug) => `https://${slug}.bamboohr.com/careers`,
  async fetchBoard(slug, ctx) {
    // Unknown subdomains redirect to the bamboohr.com marketing site.
    const response = await getJson(bambooListUrl(slug), ctx.userAgent, { followRedirects: false });
    if (response.kind !== "ok") return { ok: false, reason: response.kind, status: response.status };
    const list = asRecord(response.data).result;
    if (!Array.isArray(list)) return { ok: false, reason: "dead", status: response.status };

    const jobs: FetchedJob[] = [];
    await mapPool(list, 3, async (raw) => {
      const entry = asRecord(raw);
      const id = asString(entry.id);
      let detail: unknown;
      if (id && ctx.withDetails(asString(entry.jobOpeningName) ?? "")) {
        const detailResponse = await getJson(bambooDetailUrl(slug, id), ctx.userAgent, {
          followRedirects: false,
        });
        if (detailResponse.kind === "ok") detail = detailResponse.data;
      }
      const job = mapBambooJob(slug, raw, detail);
      if (job) jobs.push(job);
    });
    return { ok: true, jobs };
  },
};
