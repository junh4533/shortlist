import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { loadDefaultPreferences, userPreferencesSchema } from "./preferences";

describe("preferences YAML export/import", () => {
  it("round-trips identically", () => {
    const prefs = loadDefaultPreferences(path.resolve(import.meta.dirname, "../../.."));
    expect(userPreferencesSchema.parse(parse(stringify(prefs)))).toEqual(prefs);
  });
});
