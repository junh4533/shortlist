/** Company source readers: each dataset yields rows with an ATS slug, an ATS URL, or just a website. */
import { existsSync } from "node:fs";
import path from "node:path";
import type { AtsProvider } from "../ats/providers";
import { DATASETS } from "./manifest";

export type SourceRow = {
  atsProvider?: AtsProvider;
  slug?: string;
  /** URL that contains an ATS reference; resolved with extractAtsRefs. */
  atsUrl?: string;
  name?: string;
  website?: string;
  /** ISO 3166 alpha-2 when known ("US"); any other value means non-US. */
  countryCode?: string;
  lastCrawled?: string;
};

export type SourceReader = {
  id: string;
  read(cwd: string): AsyncIterable<SourceRow>;
};

/** Absolute path of a manifest dataset if it has been downloaded. */
export function datasetFile(cwd: string, id: string) {
  const entry = DATASETS.find((dataset) => dataset.id === id);
  if (!entry?.dest) return null;
  const filePath = path.resolve(cwd, entry.dest);
  return existsSync(filePath) ? filePath : null;
}
