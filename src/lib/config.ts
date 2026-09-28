/** Load and Zod-validate search.config.yaml. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const searchConfigSchema = z.object({
  profile: z.object({
    name: z.string(),
    home: z.string(),
    years_experience: z.number(),
  }),
  titles: z.object({
    include: z.array(z.string()),
    exclude: z.array(z.string()),
    prefer: z
      .union([z.array(z.string()), z.record(z.string(), z.number())])
      .default({}),
    aliases: z.record(z.string(), z.array(z.string())).default({}),
  }),
  exclude_phrases: z.array(z.string()).default([]),
  locations: z.object({
    remote_ok: z.boolean(),
    hybrid_ok: z.boolean(),
    onsite_ok: z.boolean(),
    us_only: z.boolean().default(false),
    include: z.array(z.string()),
    exclude: z.array(z.string()),
  }),
  pay: z.object({
    min_usd: z.number(),
    max_usd: z.number(),
    currency: z.string(),
    period: z.string(),
    require_listed_salary: z.boolean(),
    min_max_buffer_usd: z.number().default(0),
  }),
  freshness: z
    .object({
      max_age_days: z.number(),
      hide_unknown_date: z.boolean().default(false),
      recency_bonus: z.number().default(20),
    })
    .default({ max_age_days: 0, hide_unknown_date: false, recency_bonus: 20 }),
  skills: z.object({
    required: z.array(z.string()),
    preferred: z.array(z.string()),
    bonus: z.array(z.string()),
    aliases: z.record(z.string(), z.array(z.string())),
    min_preferred_hits: z.number(),
  }),
  seniority: z.object({
    prefer: z.union([z.array(z.string()), z.record(z.string(), z.number())]),
    exclude: z.array(z.string()),
    require_in_title: z.boolean().default(false),
    aliases: z.record(z.string(), z.array(z.string())).default({}),
  }),
  ingest: z.object({
    providers: z.array(z.enum(["greenhouse", "lever", "ashby"])),
    csv_path: z.string(),
    aggregator_json: z.record(z.enum(["greenhouse", "lever", "ashby"]), z.string()),
    polite_delay_ms: z.number(),
    concurrency: z.number(),
    user_agent: z.string(),
  }),
  harvest: z
    .object({
      cdx_delay_ms: z.number().default(1500),
      max_pages: z.number().default(5),
    })
    .default({ cdx_delay_ms: 1500, max_pages: 5 }),
});

export type SearchConfig = z.infer<typeof searchConfigSchema>;
export type AtsProvider = SearchConfig["ingest"]["providers"][number];

export function loadSearchConfig(cwd = process.cwd()): SearchConfig {
  const filePath = path.join(cwd, "search.config.yaml");
  const raw = readFileSync(filePath, "utf8");
  return searchConfigSchema.parse(parseYaml(raw));
}
