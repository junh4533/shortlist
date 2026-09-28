/** Query Common Crawl's columnar (Parquet) URL index over HTTPS with DuckDB: best for subdomain-based ATSs and backfill. */
import { queryRows, streamRows, sqlString } from "../sources/duckdb";
import { extractAtsRefs, type AtsRef } from "./patterns";

export const COLUMNAR_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "smartrecruiters.com",
  "workable.com",
  "recruitee.com",
  "bamboohr.com",
];

/** HTTPS URLs of the crawl's warc-subset Parquet files. */
export async function columnarFiles(crawl: string, limit?: number) {
  const pathsUrl = `https://data.commoncrawl.org/crawl-data/${crawl}/cc-index-table.paths.gz`;
  const rows = await queryRows<{ path: string }>(
    `SELECT path FROM read_csv(${sqlString(pathsUrl)}, header = false, columns = {'path': 'VARCHAR'})
     WHERE path LIKE '%subset=warc%'${limit ? ` LIMIT ${Math.max(1, Math.floor(limit))}` : ""}`,
  );
  return rows.map((row) => `https://data.commoncrawl.org/${row.path}`);
}

export async function harvestColumnar(options: {
  crawl: string;
  files?: number;
  onFile?: (index: number, total: number, found: number) => void;
}): Promise<AtsRef[]> {
  const files = await columnarFiles(options.crawl, options.files);
  const domains = COLUMNAR_DOMAINS.map(sqlString).join(", ");
  const found = new Map<string, AtsRef>();
  for (const [index, file] of files.entries()) {
    for await (const row of streamRows<{ url: string }>(
      `SELECT DISTINCT url FROM read_parquet(${sqlString(file)})
       WHERE url_host_registered_domain IN (${domains}) AND fetch_status = 200`,
    )) {
      for (const ref of extractAtsRefs(row.url)) found.set(`${ref.atsProvider}:${ref.slug}`, ref);
    }
    options.onFile?.(index + 1, files.length, found.size);
  }
  return [...found.values()];
}
