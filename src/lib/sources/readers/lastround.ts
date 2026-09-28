/** LastRound ATS directory CSV: ats_vendor, company_name, board_slug, last_crawled. */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { isAtsProvider } from "../../ats/providers";
import { datasetFile, type SourceReader } from "../registry";

export function parseCsvLine(line: string) {
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

export const lastround: SourceReader = {
  id: "lastround",
  async *read(cwd) {
    const filePath = datasetFile(cwd, "lastround");
    if (!filePath) return;
    const lines = createInterface({
      input: createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    let header = true;
    for await (const line of lines) {
      if (!line.trim()) continue;
      if (header) {
        header = false;
        continue;
      }
      const [vendor, name, slug, lastCrawled] = parseCsvLine(line);
      if (!slug || !isAtsProvider(vendor)) continue;
      yield { atsProvider: vendor, slug, name: name || undefined, lastCrawled: lastCrawled || undefined };
    }
  },
};
