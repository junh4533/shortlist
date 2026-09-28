/** Feashliaa job-board-aggregator per-provider slug lists (JSON arrays of strings). */
import { readFileSync } from "node:fs";
import type { AtsProvider } from "../../ats/providers";
import { datasetFile, type SourceReader } from "../registry";

const PROVIDERS: AtsProvider[] = ["greenhouse", "lever", "ashby", "bamboohr"];

export const feashliaa: SourceReader = {
  id: "feashliaa",
  async *read(cwd) {
    for (const provider of PROVIDERS) {
      const filePath = datasetFile(cwd, `feashliaa-${provider}`);
      if (!filePath) continue;
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        if (typeof item === "string" && item.trim()) yield { atsProvider: provider, slug: item };
      }
    }
  },
};
