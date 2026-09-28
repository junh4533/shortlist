/** Recruitee careers API (`{slug}.recruitee.com/api/offers/`). */
import { stripHtml } from "../html";
import { asRecord, asString, isValidJob, joinParts, toIso, withSalary } from "./common";
import { getJson } from "./http";
import type { AtsAdapter, FetchedJob } from "./types";

export function recruiteeApiUrl(slug: string) {
  return `https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`;
}

/** Recruitee location text, with "United States" appended when only the country code says so. */
function locationText(offer: Record<string, unknown>) {
  const location =
    asString(offer.location) ??
    joinParts([asString(offer.city), asString(offer.state_name), asString(offer.country)]);
  const isUs = asString(offer.country_code)?.toUpperCase() === "US";
  if (location && isUs && !/united states|\busa?\b/i.test(location)) {
    return `${location}, United States`;
  }
  return location;
}

function annualUsd(salary: Record<string, unknown>) {
  if (salary.currency !== "USD" || salary.period !== "year") return { min: null, max: null };
  const toNumber = (value: unknown) => {
    const number = typeof value === "string" ? Number(value) : value;
    return typeof number === "number" && Number.isFinite(number) ? number : null;
  };
  return { min: toNumber(salary.min), max: toNumber(salary.max) };
}

/** Recruitee `{ offers: [...] }` → FetchedJob[] (published offers only). */
export function mapRecruitee(data: unknown): FetchedJob[] | null {
  const offers = asRecord(data).offers;
  if (!Array.isArray(offers)) return null;
  return offers.flatMap((raw) => {
    const offer = asRecord(raw);
    if (offer.status && offer.status !== "published") return [];
    const remote = offer.remote === true;
    const workplace = remote
      ? "remote"
      : offer.hybrid === true
        ? "hybrid"
        : offer.on_site === true
          ? "onsite"
          : null;
    const text = [asString(offer.description), asString(offer.requirements)]
      .map((html) => stripHtml(html ?? ""))
      .filter(Boolean)
      .join("\n\n");
    const pay = annualUsd(asRecord(offer.salary));
    const mapped = {
      externalId: asString(offer.id) ?? "",
      title: asString(offer.title) ?? "",
      department: asString(offer.department),
      location: locationText(offer),
      cleanText: text,
      url: asString(offer.careers_url) ?? "",
      isRemote: remote,
      workplaceType: workplace,
      postedAt: toIso(offer.published_at) ?? toIso(offer.created_at),
      updatedAt: toIso(offer.updated_at),
    };
    return isValidJob(mapped) ? [withSalary(mapped, pay.min, pay.max)] : [];
  });
}

export const recruitee: AtsAdapter = {
  provider: "recruitee",
  boardUrl: (slug) => `https://${slug}.recruitee.com`,
  async fetchBoard(slug, ctx) {
    const response = await getJson(recruiteeApiUrl(slug), ctx.userAgent, { followRedirects: false });
    if (response.kind !== "ok") return { ok: false, reason: response.kind, status: response.status };
    const jobs = mapRecruitee(response.data);
    return jobs ? { ok: true, jobs } : { ok: false, reason: "dead", status: response.status };
  },
};
