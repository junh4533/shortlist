import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvDev } from "./load-env-dev";

const keys = ["GEMINI_API_KEY", "GEMINI_MODEL", "VERCEL"] as const;
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

describe("loadEnvDev", () => {
  it("sets missing keys from .env.dev and does not override existing ones", () => {
    delete process.env.VERCEL;
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_MODEL = "already-set";
    const dir = mkdtempSync(path.join(tmpdir(), "env-dev-"));
    writeFileSync(
      path.join(dir, ".env.dev"),
      "GEMINI_API_KEY=from-file\nGEMINI_MODEL=should-not-win\n# comment\n",
    );
    loadEnvDev(dir);
    expect(process.env.GEMINI_API_KEY).toBe("from-file");
    expect(process.env.GEMINI_MODEL).toBe("already-set");
  });

  it("does nothing on Vercel", () => {
    process.env.VERCEL = "1";
    delete process.env.GEMINI_API_KEY;
    const dir = mkdtempSync(path.join(tmpdir(), "env-dev-"));
    writeFileSync(path.join(dir, ".env.dev"), "GEMINI_API_KEY=from-file\n");
    loadEnvDev(dir);
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
  });
});
