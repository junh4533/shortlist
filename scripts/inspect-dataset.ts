/** CLI: print the schema, row count, and a few sample rows of a Parquet/CSV/JSON dataset (`npm run inspect-dataset -- <path>`). */
import path from "node:path";
import { queryRows, readerFor } from "../src/lib/sources/duckdb";

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.log("Usage: npm run inspect-dataset -- datasets/stapply.parquet [--sample 3] [--where \"...\"]");
    return;
  }
  const sampleIndex = process.argv.indexOf("--sample");
  const sample = sampleIndex === -1 ? 3 : Number(process.argv[sampleIndex + 1]);
  const whereIndex = process.argv.indexOf("--where");
  const where = whereIndex === -1 ? "" : `WHERE ${process.argv[whereIndex + 1]}`;
  const source = readerFor(path.resolve(target));

  const schema = await queryRows<{ column_name: string; column_type: string }>(
    `DESCRIBE SELECT * FROM ${source}`,
  );
  console.log("Columns");
  for (const column of schema) console.log(`  ${column.column_name.padEnd(28)} ${column.column_type}`);

  const [{ n }] = await queryRows<{ n: number }>(`SELECT count(*) AS n FROM ${source} ${where}`);
  console.log(`\nRows: ${n}`);

  const rows = await queryRows(`SELECT * FROM ${source} ${where} LIMIT ${sample}`);
  console.log("\nSample");
  for (const row of rows) {
    const trimmed = Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        const text = typeof value === "string" ? value : JSON.stringify(value);
        return [key, text && text.length > 120 ? `${text.slice(0, 120)}...` : value];
      }),
    );
    console.log(trimmed);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
