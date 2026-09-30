/** Zod schema for one user's search preferences, plus the default template in search.config.yaml. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  DEFAULT_SENIORITY_ALIASES,
  DEFAULT_SKILL_ALIASES,
  DEFAULT_TITLE_ALIASES,
} from "./aliases";

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

/** Empty search prefs for a new account; product defaults only (not a person's YAML). */
export function blankPreferences(): UserPreferences {
  return {
    profile: { name: "", home: "", years_experience: 0 },
    titles: {
      include: [],
      exclude: [],
      prefer: {},
      aliases: { ...DEFAULT_TITLE_ALIASES },
    },
    exclude_phrases: [],
    locations: {
      remote_ok: true,
      hybrid_ok: true,
      onsite_ok: true,
      us_only: false,
      include: [],
      exclude: [],
    },
    pay: {
      min_usd: 0,
      max_usd: 0,
      currency: "USD",
      period: "year",
      require_listed_salary: false,
      min_max_buffer_usd: 0,
    },
    freshness: { max_age_days: 21, hide_unknown_date: false, recency_bonus: 20 },
    skills: {
      required: [],
      preferred: [],
      bonus: [],
      aliases: { ...DEFAULT_SKILL_ALIASES },
      min_preferred_hits: 2,
    },
    seniority: {
      prefer: {},
      exclude: [],
      require_in_title: false,
      aliases: { ...DEFAULT_SENIORITY_ALIASES },
    },
    group_duplicates: true,
  };
}

/** Example fixture in search.config.yaml (tests / schema reference). Not seeded onto new accounts. */
export function loadDefaultPreferences(cwd = process.cwd()): UserPreferences {
  const raw = readFileSync(defaultPreferencesPath(cwd), "utf8");
  return userPreferencesSchema.parse(parseYaml(raw));
}

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    errors[key] ??= issue.message;
  }
  return errors;
}

export type ParsePreferencesResult =
  | { ok: true; preferences: UserPreferences }
  | { ok: false; message: string; fieldErrors: Record<string, string> };

/** Parse a full preferences document from JSON or YAML text. */
export function parsePreferencesText(text: string): ParsePreferencesResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: "The file is empty.", fieldErrors: {} };
  let raw: unknown;
  try {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      raw = JSON.parse(trimmed);
    } else {
      raw = parseYaml(trimmed);
    }
  } catch (error) {
    return { ok: false, message: `Could not parse: ${(error as Error).message}`, fieldErrors: {} };
  }
  const parsed = userPreferencesSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: "The file does not match the preferences format.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  return { ok: true, preferences: parsed.data };
}
