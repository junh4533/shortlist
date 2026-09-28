/** Zod schema for operator-only settings (ingest, discovery) loaded from ingest.config.yaml. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { ATS_PROVIDERS, type AtsProvider } from "../ats/providers";

const providerEnum = z.enum(ATS_PROVIDERS);

export const systemConfigSchema = z.object({
  ingest: z.object({
    providers: z.array(providerEnum),
    user_agent: z.string(),
    polite_delay_ms: z.number(),
    concurrency: z.number(),
    per_provider: z
      .partialRecord(
        providerEnum,
        z.object({ concurrency: z.number(), delay_ms: z.number() }).partial(),
      )
      .default({}),
    store_title_allowlist: z.array(z.string()).default([]),
    us_only: z.boolean().default(true),
  }),
  harvest: z
    .object({
      cdx_delay_ms: z.number().default(1500),
      max_pages: z.number().optional(),
      crawls: z.array(z.string()).default([]),
      github_readmes: z.array(z.string()).default([]),
    })
    .default({ cdx_delay_ms: 1500, crawls: [], github_readmes: [] }),
});

export type SystemConfig = z.infer<typeof systemConfigSchema>;

export function systemConfigPath(cwd = process.cwd()) {
  return path.join(cwd, "ingest.config.yaml");
}

export function parseSystemConfig(raw: string): SystemConfig {
  return systemConfigSchema.parse(parseYaml(raw));
}

export function loadSystemConfig(cwd = process.cwd()): SystemConfig {
  return parseSystemConfig(readFileSync(systemConfigPath(cwd), "utf8"));
}

/** Concurrency and delay for one provider, falling back to the global ingest settings. */
export function providerLimits(config: SystemConfig, provider: AtsProvider) {
  const override = config.ingest.per_provider[provider] ?? {};
  return {
    concurrency: override.concurrency ?? config.ingest.concurrency,
    delayMs: override.delay_ms ?? config.ingest.polite_delay_ms,
  };
}
