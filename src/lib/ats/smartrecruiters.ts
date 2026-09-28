/** SmartRecruiters public postings API: paginated list, descriptions from a per-posting detail call. */
import { mapPool } from "../concurrency";
import { stripHtml } from "../html";
import { asRecord, asString, isValidJob, joinParts, toIso, withSalary } from "./common";
import { getJson } from "./http";
import type { AtsAdapter, FetchedJob } from "./types";

const PAGE_SIZE = 100;
const MAX_POSTINGS = 2000;

export function smartRecruitersListUrl(slug: string, offset: number) {
  return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=${PAGE_SIZE}&offset=${offset}`;
}

function workplaceFrom(location: Record<string, unknown>) {
  if (location.remote === true) return "remote";
  if (location.hybrid === true) return "hybrid";
  return null;
}

/** Plain text of the job ad sections in a posting detail response. */
export function smartRecruitersDetailText(detail: unknown) {
  const sections = asRecord(asRecord(asRecord(detail).jobAd).sections);
  return ["jobDescription", "qualifications", "additionalInformation", "companyDescription"]
    .map((key) => stripHtml(asString(asRecord(sections[key]).text) ?? ""))
    .filter(Boolean)
    .join("\n\n");
}

/** One list entry (+ optional detail) → FetchedJob. */
export function mapSmartRecruitersPosting(
  slug: string,
  raw: unknown,
  detail?: unknown,
): FetchedJob | null {
  const posting = asRecord(raw);
  const location = asRecord(posting.location);
  const detailRecord = asRecord(detail);
  const id = asString(posting.id) ?? "";
  const workplace = workplaceFrom(location);
  const department =
    asString(asRecord(posting.department).label) ?? asString(asRecord(posting.function).label);
  const mapped = {
    externalId: id,
    title: asString(posting.name) ?? "",
    department,
    location:
      asString(location.fullLocation) ??
      joinParts([asString(location.city), asString(location.region), asString(location.country)?.toUpperCase()]),
    cleanText: detail ? smartRecruitersDetailText(detail) : "",
    url:
      asString(detailRecord.postingUrl) ??
      (id ? `https://jobs.smartrecruiters.com/${slug}/${id}` : ""),
    isRemote: location.remote === true,
    workplaceType: workplace,
    postedAt: toIso(posting.releasedDate),
    updatedAt: toIso(posting.releasedDate),
  };
  return isValidJob(mapped) ? withSalary(mapped) : null;
}

export const smartrecruiters: AtsAdapter = {
  provider: "smartrecruiters",
  boardUrl: (slug) => `https://jobs.smartrecruiters.com/${slug}`,
  async fetchBoard(slug, ctx) {
    const postings: unknown[] = [];
    let total = Infinity;
    for (let offset = 0; offset < Math.min(total, MAX_POSTINGS); offset += PAGE_SIZE) {
      const response = await getJson(smartRecruitersListUrl(slug, offset), ctx.userAgent, {
        retryOn5xx: true,
      });
      if (response.kind !== "ok") return { ok: false, reason: response.kind, status: response.status };
      const page = asRecord(response.data);
      const content = page.content;
      if (!Array.isArray(content)) return { ok: false, reason: "dead", status: response.status };
      total = typeof page.totalFound === "number" ? page.totalFound : content.length;
      postings.push(...content);
      if (content.length < PAGE_SIZE) break;
    }
    // Unknown company identifiers return 200 with no postings.
    if (postings.length === 0 && !ctx.previouslyLive) return { ok: false, reason: "dead" };

    const jobs: FetchedJob[] = [];
    await mapPool(postings, 3, async (raw) => {
      const posting = asRecord(raw);
      let detail: unknown;
      const ref = asString(posting.ref);
      if (ref && ctx.withDetails(asString(posting.name) ?? "")) {
        const response = await getJson(ref, ctx.userAgent);
        if (response.kind === "ok") detail = response.data;
      }
      const job = mapSmartRecruitersPosting(slug, raw, detail);
      if (job) jobs.push(job);
    });
    return { ok: true, jobs };
  },
};
