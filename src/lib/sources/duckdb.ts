/** Thin DuckDB helper for reading Parquet/CSV/JSON datasets and the Common Crawl columnar index. */
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

let connectionPromise: Promise<DuckDBConnection> | null = null;

export async function duckdb() {
  connectionPromise ??= DuckDBInstance.create(":memory:").then((instance) =>
    instance.connect(),
  );
  return connectionPromise;
}

/** Run a query and return plain JS rows (BigInts converted to numbers). */
export async function queryRows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const connection = await duckdb();
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson() as T[];
}

function plain(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object") return String(value);
  return value;
}

/** Stream rows in chunks without materializing the whole result. Nested values become strings. */
export async function* streamRows<T = Record<string, unknown>>(sql: string): AsyncGenerator<T> {
  const connection = await duckdb();
  const result = await connection.stream(sql);
  const names = result.columnNames();
  for (;;) {
    const chunk = await result.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    for (const values of chunk.getRows()) {
      const row: Record<string, unknown> = {};
      names.forEach((name, index) => {
        row[name] = plain(values[index]);
      });
      yield row as T;
    }
  }
}

/** Single-quoted SQL string literal (paths are passed in with forward slashes). */
export function sqlString(value: string) {
  return `'${value.replace(/\\/g, "/").replace(/'/g, "''")}'`;
}

export function readerFor(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".parquet")) return `read_parquet(${sqlString(filePath)})`;
  if (lower.endsWith(".csv")) return `read_csv_auto(${sqlString(filePath)})`;
  return `read_json_auto(${sqlString(filePath)}, maximum_object_size=1073741824)`;
}
