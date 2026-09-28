/**
 * Parse the top-domain lists in datasets/domain_lists into { domain, rank, source } rows.
 * Formats seen: Tranco and Cisco Umbrella `rank,domain` (no header); Piperic `rank,domain,linking_domains`;
 * Majestic `GlobalRank,TldRank,Domain,...`; NetAPI `NetAPI_Rank,Domain`; Cloudflare Radar `domain` (no rank).
 */
import { createReadStream, readdirSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

export type SeedListRow = { domain: string; rank: number | null };

/** Source id from a list's filename. */
export function seedSourceFor(fileName: string) {
  const name = fileName.toLowerCase();
  if (name.startsWith("tranco")) return "tranco";
  if (name.includes("majestic")) return "majestic";
  if (name.includes("netapi")) return "netapi";
  if (name.includes("cloudflare") || name.includes("radar")) {
    return /(^|[_-])us([_.-]|$)/.test(name) ? "cloudflare-radar-us" : "cloudflare-radar";
  }
  if (name === "top-1m.csv" || name.includes("piperic")) return "piperic";
  if (name === "1m.csv" || name.includes("umbrella")) return "umbrella";
  return name.replace(/\.csv$/, "");
}

function splitCsv(line: string) {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

/** Column positions from a header row, or null when the first line is data. */
export function headerColumns(firstLine: string) {
  const cells = splitCsv(firstLine).map((cell) => cell.toLowerCase());
  if (/^\d+$/.test(cells[0] ?? "")) return null;
  const domain = cells.findIndex((cell) => cell === "domain");
  const rank = cells.findIndex(
    (cell) => cell === "rank" || (cell.endsWith("rank") && !cell.startsWith("prev") && cell !== "tldrank"),
  );
  return { domain: domain === -1 ? 0 : domain, rank };
}

export async function* readSeedList(filePath: string): AsyncGenerator<SeedListRow> {
  const lines = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let columns: { domain: number; rank: number } | null | undefined;
  for await (const line of lines) {
    if (!line.trim()) continue;
    if (columns === undefined) {
      columns = headerColumns(line);
      if (columns) continue;
    }
    const cells = splitCsv(line);
    const domainIndex = columns ? columns.domain : 1;
    const rankIndex = columns ? columns.rank : 0;
    const domain = cells[domainIndex];
    if (!domain) continue;
    const rank = rankIndex >= 0 ? Number(cells[rankIndex]) : NaN;
    yield { domain, rank: Number.isFinite(rank) ? rank : null };
  }
}

export function seedListFiles(dir = path.join(process.cwd(), "datasets", "domain_lists")) {
  try {
    return readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith(".csv"))
      .map((name) => ({ file: path.join(dir, name), source: seedSourceFor(name) }));
  } catch {
    return [];
  }
}
