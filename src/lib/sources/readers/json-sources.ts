/**
 * JSON/CSV company lists that mostly give websites or ATS links, not slugs.
 * - companies_v2.json (OpenJobs): name, website, ats_links[], list_urls[], countries[] (English names).
 * - hiring.json (yc-oss): name, website, all_locations; its `slug` is YC's, not an ATS slug.
 * - companies.csv (State of ATS): name, slug, ats_system, apply_host, hq_country_code.
 */
import { readFileSync } from "node:fs";
import type { AtsProvider } from "../../ats/providers";
import { readerFor, streamRows } from "../duckdb";
import { datasetFile, type SourceReader, type SourceRow } from "../registry";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readJsonArray(filePath: string): Record<string, unknown>[] {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
}

function countryFromList(countries: unknown) {
  if (!Array.isArray(countries) || countries.length === 0) return undefined;
  return countries.some((country) => /^(united states|usa|us)$/i.test(String(country))) ? "US" : "non-US";
}

export const openjobs: SourceReader = {
  id: "openjobs",
  async *read(cwd) {
    const filePath = datasetFile(cwd, "openjobs");
    if (!filePath) return;
    for (const company of readJsonArray(filePath)) {
      const links = [company.ats_links, company.list_urls]
        .flatMap((value) => (Array.isArray(value) ? value : []))
        .map(String);
      const row: SourceRow = {
        name: text(company.name),
        website: text(company.website),
        countryCode: countryFromList(company.countries),
      };
      if (links.length) yield { ...row, atsUrl: links.join(" ") };
      else yield row;
    }
  },
};

export const yc: SourceReader = {
  id: "yc",
  async *read(cwd) {
    const filePath = datasetFile(cwd, "yc");
    if (!filePath) return;
    for (const company of readJsonArray(filePath)) {
      const locations = text(company.all_locations);
      yield {
        name: text(company.name),
        website: text(company.website),
        countryCode: locations ? (/\b(USA|United States)\b/.test(locations) ? "US" : "non-US") : undefined,
      };
    }
  },
};

const STATE_OF_ATS_SYSTEMS: Record<string, AtsProvider> = {
  Greenhouse: "greenhouse",
  Lever: "lever",
  Ashby: "ashby",
  SmartRecruiters: "smartrecruiters",
  Workable: "workable",
  Recruitee: "recruitee",
  BambooHR: "bamboohr",
};

export const stateOfAts: SourceReader = {
  id: "state-of-ats",
  async *read(cwd) {
    const filePath = datasetFile(cwd, "state-of-ats");
    if (!filePath) return;
    for await (const row of streamRows(
      `SELECT name, slug, ats_system, apply_host, hq_country_code FROM ${readerFor(filePath)}`,
    )) {
      const atsProvider = STATE_OF_ATS_SYSTEMS[String(row.ats_system ?? "")];
      if (!atsProvider) continue;
      // apply_host is only the ATS host (e.g. job-boards.greenhouse.io), so the dataset's own
      // slug is the best guess; ingest verifies it against the live API.
      yield {
        atsProvider,
        slug: text(row.slug),
        name: text(row.name),
        countryCode: text(row.hq_country_code),
      };
    }
  },
};
