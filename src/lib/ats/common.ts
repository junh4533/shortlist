/** Helpers shared by adapter mappers: salary fallback, date parsing, and safe field access. */
import { parseSalaryFromText } from "../match";
import type { FetchedJob } from "./types";

export type JobWithoutSalary = Omit<FetchedJob, "salaryMin" | "salaryMax" | "salaryUnknown">;

/** Prefer salary from the ATS payload; otherwise scrape $ / k ranges from title+text. */
export function withSalary(
  job: JobWithoutSalary,
  structuredMin?: number | null,
  structuredMax?: number | null,
): FetchedJob {
  const fromText = parseSalaryFromText(`${job.title} ${job.cleanText}`);
  const salaryMin = structuredMin ?? fromText.min;
  const salaryMax = structuredMax ?? fromText.max;
  return {
    ...job,
    salaryMin,
    salaryMax,
    salaryUnknown: salaryMin == null && salaryMax == null,
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

/** ISO string from epoch millis, ISO text, or "2026-08-28 11:09:19 UTC" style text. */
export function toIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim().replace(/ UTC$/, "Z").replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2");
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function joinParts(parts: (string | null | undefined)[], separator = ", ") {
  const text = parts.map((part) => part?.trim()).filter(Boolean).join(separator);
  return text || null;
}

export function isValidJob(job: JobWithoutSalary) {
  return Boolean(job.externalId && job.title && job.url);
}
