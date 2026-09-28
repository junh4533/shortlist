/** Columns computed once at ingest so the read path can filter in SQL. */
import { createHash } from "node:crypto";
import { hasUsLocationSignal, isNonUsLocation } from "../match";

export type DerivableJob = {
  title: string;
  location: string | null;
  cleanText: string;
  url: string;
  salaryMin: number | null;
  salaryMax: number | null;
  postedAt: string | null;
  updatedAt: string | null;
  isRemote?: boolean | null;
};

export type DerivedJobFields = {
  /** title.toLowerCase(): the same text titleMatches substring-matches against. */
  titleNorm: string;
  locationNorm: string | null;
  seniority: string | null;
  /** false = explicitly non-US (the matcher's us_only rule would drop it), true = US signal, null = unknown. */
  isUs: boolean | null;
  /** Date.parse(postedAt ?? updatedAt), null when missing or unparseable (same as isWithinMaxAge). */
  postedTs: number | null;
  contentHash: string;
};

const SENIORITY_PATTERNS: [string, RegExp][] = [
  ["intern", /\b(intern|internship|co-op)\b/i],
  ["principal", /\b(principal|distinguished|fellow)\b/i],
  ["staff", /\bstaff\b/i],
  ["director", /\b(director|head of|vp|vice president)\b/i],
  ["manager", /\bmanager\b/i],
  ["lead", /\b(lead|tech lead)\b/i],
  ["senior", /\b(senior|sr\.?)\b/i],
  ["junior", /\b(junior|jr\.?|entry[- ]level|new grad|graduate)\b/i],
  ["mid", /\b(mid|mid-level|intermediate)\b/i],
];

export function seniorityOf(title: string) {
  return SENIORITY_PATTERNS.find(([, pattern]) => pattern.test(title))?.[0] ?? null;
}

export function normalizeLocation(location: string | null) {
  const text = (location ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return text || null;
}

export function usSignal(location: string | null): boolean | null {
  const text = (location ?? "").toLowerCase();
  if (!text.trim()) return null;
  if (isNonUsLocation(text)) return false;
  return hasUsLocationSignal(text) ? true : null;
}

export function postedTimestamp(postedAt: string | null, updatedAt: string | null) {
  const raw = postedAt ?? updatedAt;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? null : time;
}

export function deriveJobFields(job: DerivableJob): DerivedJobFields {
  const contentHash = createHash("sha1")
    .update(
      [
        job.title,
        job.location ?? "",
        job.cleanText,
        job.salaryMin ?? "",
        job.salaryMax ?? "",
        job.url,
        job.postedAt ?? "",
      ].join("\u0000"),
    )
    .digest("hex");
  return {
    titleNorm: job.title.toLowerCase(),
    locationNorm: normalizeLocation(job.location),
    seniority: seniorityOf(job.title),
    isUs: usSignal(job.location),
    postedTs: postedTimestamp(job.postedAt, job.updatedAt),
    contentHash,
  };
}
