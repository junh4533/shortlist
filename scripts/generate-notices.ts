/** Write THIRD_PARTY_NOTICES.md from the dataset manifest (`npm run notices`). */
import { writeFileSync } from "node:fs";
import { DATASETS } from "../src/lib/sources/manifest";

const lines = [
  "# Third-party data",
  "",
  "The code in this repository is MIT-licensed. The datasets below keep their own licenses.",
  "Job postings belong to the employers that published them.",
  "Files under `datasets/` are downloaded locally and are not part of this repository.",
  "",
  "## Attribution required",
  "",
];

function block(entry: (typeof DATASETS)[number]) {
  return [
    `- **${entry.name}** (${entry.license}${entry.verified ? "" : ", license not fully verified"})`,
    `  ${entry.homepage}`,
    entry.licenseUrl ? `  License: ${entry.licenseUrl}` : "",
    entry.note ? `  ${entry.note}` : "",
    `  Used as: ${entry.usage}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const required = DATASETS.filter((entry) => entry.attributionRequired);
const mit = DATASETS.filter((entry) => !entry.attributionRequired && entry.license.startsWith("MIT"));
const optional = DATASETS.filter(
  (entry) => !entry.attributionRequired && !entry.license.startsWith("MIT") && entry.license !== "Unknown" && !entry.license.startsWith("Unknown"),
);
const unknown = DATASETS.filter((entry) => entry.license === "Unknown" || entry.license.startsWith("Unknown"));

lines.push(...required.map(block), "", "## MIT", "", ...mit.map(block), "", "## Credit optional", "", ...optional.map(block), "", "## License not confirmed", "", ...unknown.map(block), "");
lines.push(
  "Takedown: open an issue on this repository or email the address in the site footer if a posting should be removed.",
  "",
);
writeFileSync("THIRD_PARTY_NOTICES.md", `${lines.join("\n")}\n`);
console.log("Wrote THIRD_PARTY_NOTICES.md");
