/** CLI: recompute likely cross-platform duplicate groups (`npm run group-duplicates`). Also runs at the end of ingest. */
import { migrate } from "../src/lib/db";
import { regroupDuplicates } from "../src/lib/jobs/regroup";

async function main() {
  await migrate();
  await regroupDuplicates((line) => console.log(line));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
