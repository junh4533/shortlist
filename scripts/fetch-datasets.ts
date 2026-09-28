/** CLI: download third-party datasets listed in the manifest into datasets/ (`npm run fetch-datasets`). */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { DATASETS } from "../src/lib/sources/manifest";

const USER_AGENT = "jb-dataset-fetch/1.0 (personal job search)";

async function download(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function main() {
  const force = process.argv.includes("--force");
  const only = process.argv.includes("--only")
    ? process.argv[process.argv.indexOf("--only") + 1]
    : undefined;

  for (const entry of DATASETS) {
    if (!entry.dest) continue;
    if (only && entry.id !== only) continue;
    const dest = path.resolve(process.cwd(), entry.dest);
    if (!entry.url) {
      const state = existsSync(dest) ? "present" : "missing";
      console.log(`manual   ${entry.id} (${state}) -> ${entry.dest}  ${entry.note ?? entry.homepage}`);
      continue;
    }
    if (existsSync(dest) && !force) {
      console.log(`skip     ${entry.id} (exists; --force to refresh)`);
      continue;
    }
    try {
      let bytes = await download(entry.url);
      if (entry.zipEntry) {
        const files = unzipSync(bytes);
        const file = files[entry.zipEntry];
        if (!file) throw new Error(`${entry.zipEntry} not found in archive`);
        bytes = file;
      }
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, bytes);
      console.log(`fetched  ${entry.id} -> ${entry.dest} (${(bytes.length / 1e6).toFixed(1)} MB)`);
    } catch (error) {
      console.error(`failed   ${entry.id}: ${(error as Error).message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
