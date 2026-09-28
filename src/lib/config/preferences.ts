/** Zod schema for one user's search preferences, plus the default template in search.config.yaml. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const weightedList = z.union([
  z.array(z.string()),
  z.record(z.string(), z.number()),
]);

export const userPreferencesSchema = z.object({
  profile: z.object({
    name: z.string(),
    home: z.string(),
    years_experience: z.number(),
  }),
  titles: z.object({
    include: z.array(z.string()),
    exclude: z.array(z.string()),
    prefer: weightedList.default({}),
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
    prefer: weightedList,
    exclude: z.array(z.string()),
    require_in_title: z.boolean().default(false),
    aliases: z.record(z.string(), z.array(z.string())).default({}),
  }),
  group_duplicates: z.boolean().default(true),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export function defaultPreferencesPath(cwd = process.cwd()) {
  return path.join(cwd, "search.config.yaml");
}

/** The default template every new user starts from. */
export function loadDefaultPreferences(cwd = process.cwd()): UserPreferences {
  const raw = readFileSync(defaultPreferencesPath(cwd), "utf8");
  return userPreferencesSchema.parse(parseYaml(raw));
}
