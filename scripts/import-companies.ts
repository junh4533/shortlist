/** CLI: import every downloaded dataset into companies with per-source stats (`npm run import-companies`). */
import { loadSystemConfig } from "../src/lib/config";
import { migrate } from "../src/lib/db";
import { importAllSources } from "../src/lib/sources/import";

async function main() {
  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex === -1 ? undefined : process.argv[onlyIndex + 1];
  await migrate();
  await importAllSources({
    providers: loadSystemConfig().ingest.providers,
    only,
    log: (line) => console.log(line),
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
