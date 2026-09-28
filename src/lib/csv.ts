/** Read LastRound CSV and aggregator JSON slug lists into company rows. */
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import type { AtsProvider, SearchConfig } from "./config";

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

export async function* readAllCompanySources(config: SearchConfig, cwd: string) {
  const csvPath = path.resolve(cwd, config.ingest.csv_path);
  for await (const row of readCompanyCsv(csvPath)) {
    yield { ...row, source: "lastround" as const };
  }
  for (const provider of config.ingest.providers) {
    const relative = config.ingest.aggregator_json[provider];
    if (!relative) continue;
    const filePath = path.resolve(cwd, relative);
    for (const row of readAggregatorJson(filePath, provider)) {
      yield { ...row, source: "aggregator" as const };
    }
  }
}
