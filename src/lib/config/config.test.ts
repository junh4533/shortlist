import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { loadDefaultPreferences, userPreferencesSchema } from "./preferences";
import { loadSystemConfig, parseSystemConfig, providerLimits } from "./system";

const root = path.resolve(import.meta.dirname, "../../..");

describe("user preferences", () => {
  it("parses the default template", () => {
    const prefs = loadDefaultPreferences(root);
    expect(prefs.titles.include.length).toBeGreaterThan(0);
    expect(prefs.group_duplicates).toBe(true);
  });

  it("does not accept ingest settings as preferences keys", () => {
    const raw = parseYaml(readFileSync(path.join(root, "search.config.yaml"), "utf8"));
    expect(raw.ingest).toBeUndefined();
    expect(userPreferencesSchema.safeParse(raw).success).toBe(true);
  });
});

describe("system config", () => {
  it("parses ingest.config.yaml", () => {
    const config = loadSystemConfig(root);
    expect(config.ingest.providers).toContain("greenhouse");
    expect(config.ingest.store_title_allowlist.length).toBeGreaterThan(0);
  });

  it("rejects unknown providers", () => {
    expect(() =>
      parseSystemConfig(`ingest:\n  providers: [workday]\n  user_agent: x\n  polite_delay_ms: 1\n  concurrency: 1\n`),
    ).toThrow();
  });

  it("falls back to global limits when a provider has no override", () => {
    const config = parseSystemConfig(
      `ingest:\n  providers: [greenhouse, workable]\n  user_agent: x\n  polite_delay_ms: 300\n  concurrency: 6\n  per_provider:\n    workable: { concurrency: 1, delay_ms: 2000 }\n`,
    );
    expect(providerLimits(config, "workable")).toEqual({ concurrency: 1, delayMs: 2000 });
    expect(providerLimits(config, "greenhouse")).toEqual({ concurrency: 6, delayMs: 300 });
  });
});
