import { describe, expect, it } from "vitest";
import { blankPreferences } from "../config";
import {
  buildStarterPreferences,
  missingResumeQuestions,
  seniorityFromYears,
} from "./starter";

describe("seniorityFromYears", () => {
  it("treats under 2 years as intern-level and excludes staff/principal titles", () => {
    const result = seniorityFromYears(1);
    expect(result.prefer).toMatchObject({ intern: 3, junior: 3 });
    expect(result.titleExclude).toEqual(expect.arrayContaining(["Staff", "Principal"]));
  });

  it("excludes staff and principal under 8 years", () => {
    const result = seniorityFromYears(5);
    expect(result.exclude).toEqual(expect.arrayContaining(["staff", "principal"]));
    expect(result.titleExclude).toEqual(expect.arrayContaining(["Staff", "Principal"]));
  });
});

describe("buildStarterPreferences", () => {
  it("fills pay, home, and Remote from answers without Gemini", () => {
    const { preferences, usedModel } = buildStarterPreferences(
      {
        yearsExperience: 5,
        currentTitle: "Frontend Engineer",
        targetSalaryUsd: 120_000,
        skills: ["React", "TypeScript"],
        home: "Flushing, NY",
      },
      null,
    );
    expect(usedModel).toBe(false);
    expect(preferences.pay.min_usd).toBe(120_000);
    expect(preferences.pay.max_usd).toBe(150_000);
    expect(preferences.locations.include).toEqual(["Flushing, NY", "Remote"]);
    expect(preferences.titles.include).toContain("Frontend Engineer");
    expect(preferences.skills.preferred).toEqual(["React", "TypeScript"]);
    expect(preferences.titles.exclude).toEqual(expect.arrayContaining(["Staff", "Principal"]));
  });

  it("merges Gemini titles and marks usedModel", () => {
    const { preferences, usedModel } = buildStarterPreferences(
      { yearsExperience: 4, currentTitle: "Engineer", skills: ["Go"], home: "Austin" },
      {
        titles: { include: ["Software Engineer"], exclude: ["Mobile"], prefer: { backend: 2 } },
        skills: { preferred: ["Python"], bonus: ["AWS"] },
      },
    );
    expect(usedModel).toBe(true);
    expect(preferences.titles.include).toEqual(expect.arrayContaining(["Engineer", "Software Engineer"]));
    expect(preferences.skills.bonus).toContain("AWS");
  });

  it("starts from blankPreferences product defaults", () => {
    const blank = blankPreferences();
    const { preferences } = buildStarterPreferences({}, null);
    expect(preferences.pay.currency).toBe(blank.pay.currency);
    expect(preferences.freshness.max_age_days).toBe(blank.freshness.max_age_days);
    expect(preferences.group_duplicates).toBe(true);
  });
});

describe("missingResumeQuestions", () => {
  it("asks only for fields that are still empty", () => {
    expect(
      missingResumeQuestions({
        yearsExperience: 6,
        currentTitle: "Engineer",
        targetSalaryUsd: null,
        skills: ["React"],
        home: "",
      }),
    ).toEqual(["salary", "home"]);
  });
});
