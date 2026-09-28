/** Read LastRound CSV and aggregator JSON slug lists into company rows. */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import type { AtsProvider } from "./config";
import { DATASETS } from "./sources/manifest";

export type CompanyRow = {
  atsProvider: AtsProvider;
  name: string;
  slug: string;
  lastCrawled: string | null;
};

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

export async function* readCompanyCsv(filePath: string) {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let header = true;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (header) {
      header = false;
      continue;
    }
    const [vendor, name, slug, lastCrawled] = cells;
    if (vendor !== "greenhouse" && vendor !== "lever" && vendor !== "ashby") {
      continue;
    }
    if (!slug) continue;
    yield {
      atsProvider: vendor,
      name: name || slug,
      slug,
      lastCrawled: lastCrawled || null,
    } satisfies CompanyRow;
  }
}

export function* readAggregatorJson(filePath: string, provider: AtsProvider) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) return;
  for (const item of parsed) {
    if (typeof item !== "string" || !item.trim()) continue;
    const slug = item.trim();
    yield {
      atsProvider: provider,
      name: slug,
      slug,
      lastCrawled: null,
    } satisfies CompanyRow;
  }
}

function datasetPath(cwd: string, id: string) {
  const entry = DATASETS.find((dataset) => dataset.id === id);
  if (!entry?.dest) return null;
  const filePath = path.resolve(cwd, entry.dest);
  return existsSync(filePath) ? filePath : null;
}

export async function* readAllCompanySources(
  providers: readonly AtsProvider[],
  cwd: string,
) {
  const csvPath = datasetPath(cwd, "lastround");
  if (csvPath) {
    for await (const row of readCompanyCsv(csvPath)) {
      yield { ...row, source: "lastround" as const };
    }
  }
  for (const provider of providers) {
    const filePath = datasetPath(cwd, `feashliaa-${provider}`);
    if (!filePath) continue;
    for (const row of readAggregatorJson(filePath, provider)) {
      yield { ...row, source: "feashliaa" as const };
    }
  }
}
