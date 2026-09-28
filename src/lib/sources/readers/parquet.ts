/**
 * Parquet sources read with DuckDB.
 * - stapply.parquet: ats, name, slug, url (no country).
 * - openjobdata.parquet: name, website, ats ("ashbyhq" for Ashby), slug, career_url, country (lowercase name).
 * - companies.parquet (OnlyNerds): name, ats (sometimes "greenhouse | workday"), url, domain, regions ("US-CA", "EU", ...).
 */
import { isAtsProvider, type AtsProvider } from "../../ats/providers";
import { readerFor, streamRows } from "../duckdb";
import { datasetFile, type SourceReader, type SourceRow } from "../registry";

const ATS_ALIASES: Record<string, AtsProvider> = { ashbyhq: "ashby" };

/** First supported provider in an ats cell like "lever | workday". */
function providerFrom(value: unknown): AtsProvider | undefined {
  for (const part of String(value ?? "").split("|")) {
    const id = part.trim().toLowerCase();
    const provider = ATS_ALIASES[id] ?? id;
    if (isAtsProvider(provider)) return provider;
  }
  return undefined;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const stapply: SourceReader = {
  id: "stapply",
  async *read(cwd) {
    const filePath = datasetFile(cwd, "stapply");
    if (!filePath) return;
    for await (const row of streamRows(`SELECT ats, name, slug, url FROM ${readerFor(filePath)}`)) {
      const atsProvider = providerFrom(row.ats);
      if (!atsProvider) continue;
      yield { atsProvider, slug: text(row.slug), atsUrl: text(row.url), name: text(row.name) } satisfies SourceRow;
    }
  },
};

export const openjobdata: SourceReader = {
  id: "openjobdata",
  async *read(cwd) {
    const filePath = datasetFile(cwd, "openjobdata");
    if (!filePath) return;
    for await (const row of streamRows(
      `SELECT name, website, ats, slug, career_url, country FROM ${readerFor(filePath)}`,
    )) {
      const atsProvider = providerFrom(row.ats);
      if (!atsProvider) continue;
      const country = text(row.country)?.toLowerCase();
      yield {
        atsProvider,
        slug: text(row.slug),
        atsUrl: text(row.career_url),
        name: text(row.name),
        website: text(row.website),
        countryCode: country ? (country === "united states" ? "US" : country) : undefined,
      } satisfies SourceRow;
    }
  },
};

export const onlynerds: SourceReader = {
  id: "onlynerds",
  async *read(cwd) {
    const filePath = datasetFile(cwd, "companies-parquet");
    if (!filePath) return;
    for await (const row of streamRows(`SELECT name, ats, url, domain, regions FROM ${readerFor(filePath)}`)) {
      const atsProvider = providerFrom(row.ats);
      if (!atsProvider) continue;
      const regions = text(row.regions);
      yield {
        atsProvider,
        atsUrl: text(row.url),
        name: text(row.name)?.replace(/^"+/, ""),
        website: text(row.domain),
        // OnlyNerds only has region buckets; US-CA (US and Canada) is the closest to US.
        countryCode: regions ? (regions.includes("US") ? "US" : regions) : undefined,
      } satisfies SourceRow;
    }
  },
};
