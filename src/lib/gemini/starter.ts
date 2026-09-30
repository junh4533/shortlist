/** Build a preferences draft from questionnaire answers and/or Gemini starter JSON. */
import { blankPreferences, type UserPreferences } from "../config";
import type { GeminiStarter } from "./schema";

export type StarterAnswers = {
  yearsExperience?: number | null;
  currentTitle?: string | null;
  targetSalaryUsd?: number | null;
  skills?: string[] | null;
  home?: string | null;
};

export type BuildStarterResult = {
  preferences: UserPreferences;
  usedModel: boolean;
};

function uniq(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Seniority weights and title excludes from years of experience. */
export function seniorityFromYears(years: number): Pick<UserPreferences["seniority"], "prefer" | "exclude"> & {
  titleExclude: string[];
} {
  if (years < 2) {
    return {
      prefer: { intern: 3, junior: 3, unleveled: 2, mid: 1 },
      exclude: ["staff", "principal", "distinguished", "senior"],
      titleExclude: ["Staff", "Principal", "Distinguished", "Senior", "Manager", "Director", "VP"],
    };
  }
  if (years < 8) {
    return {
      prefer: { mid: 3, "mid-senior": 3, unleveled: 2, senior: 1 },
      exclude: ["intern", "junior", "staff", "principal", "distinguished"],
      titleExclude: ["Staff", "Principal", "Distinguished", "Intern", "Manager", "Director", "VP"],
    };
  }
  return {
    prefer: { senior: 3, "mid-senior": 2, staff: 2, unleveled: 1 },
    exclude: ["intern", "junior"],
    titleExclude: ["Intern", "Junior"],
  };
}

function applyAnswers(draft: UserPreferences, answers: StarterAnswers): UserPreferences {
  const next = structuredClone(draft);
  const years = answers.yearsExperience;
  if (typeof years === "number" && Number.isFinite(years) && years >= 0) {
    next.profile.years_experience = years;
    const seniority = seniorityFromYears(years);
    next.seniority.prefer = seniority.prefer;
    next.seniority.exclude = seniority.exclude;
    next.titles.exclude = uniq([...next.titles.exclude, ...seniority.titleExclude]);
  }

  const home = answers.home?.trim();
  if (home) {
    next.profile.home = home;
    next.locations.include = uniq([home, "Remote", ...next.locations.include]);
  }

  const salary = answers.targetSalaryUsd;
  if (typeof salary === "number" && Number.isFinite(salary) && salary > 0) {
    next.pay.min_usd = Math.round(salary);
    next.pay.max_usd = Math.round(salary * 1.25);
  }

  const skills = answers.skills?.filter(Boolean);
  if (skills?.length) {
    next.skills.preferred = uniq([...next.skills.preferred, ...skills]);
  }

  const title = answers.currentTitle?.trim();
  if (title) {
    next.titles.include = uniq([title, ...next.titles.include]);
  }

  return next;
}

function applyGemini(draft: UserPreferences, starter: GeminiStarter): UserPreferences {
  const next = structuredClone(draft);
  next.titles.include = uniq([...starter.titles.include, ...next.titles.include]);
  next.titles.exclude = uniq([...next.titles.exclude, ...starter.titles.exclude]);
  next.titles.prefer = { ...starter.titles.prefer, ...(typeof next.titles.prefer === "object" && !Array.isArray(next.titles.prefer) ? next.titles.prefer : {}) };
  next.skills.preferred = uniq([...starter.skills.preferred, ...next.skills.preferred]);
  next.skills.bonus = uniq([...starter.skills.bonus, ...next.skills.bonus]);

  const profile = starter.profile;
  if (profile) {
    if (typeof profile.years_experience === "number") {
      next.profile.years_experience = profile.years_experience;
    }
    if (profile.home?.trim()) {
      next.profile.home = profile.home.trim();
      next.locations.include = uniq([profile.home.trim(), "Remote", ...next.locations.include]);
    }
    if (profile.current_title?.trim()) {
      next.titles.include = uniq([profile.current_title.trim(), ...next.titles.include]);
    }
    if (profile.skills?.length) {
      next.skills.preferred = uniq([...profile.skills, ...next.skills.preferred]);
    }
  }
  return next;
}

/** Rule-filled draft from answers, then merge Gemini JSON when valid. */
export function buildStarterPreferences(
  answers: StarterAnswers,
  gemini: GeminiStarter | null,
): BuildStarterResult {
  let preferences = applyAnswers(blankPreferences(), answers);
  if (gemini) {
    preferences = applyGemini(preferences, gemini);
    return { preferences, usedModel: true };
  }
  return { preferences, usedModel: false };
}

export function questionnairePrompt(answers: StarterAnswers): string {
  return [
    "You help build job-search preferences for a personal job board.",
    "Return JSON only matching the schema: titles.include/exclude/prefer and skills.preferred/bonus.",
    "Prefer concrete role titles and skills. Prefer weights are small numbers (1-3).",
    "Do not invent employer names. Keep lists short (about 5-12 items each).",
    "",
    `Years of experience: ${answers.yearsExperience ?? "unknown"}`,
    `Current title: ${answers.currentTitle?.trim() || "unknown"}`,
    `Target yearly salary (USD): ${answers.targetSalaryUsd ?? "unknown"}`,
    `Top skills: ${(answers.skills ?? []).join(", ") || "unknown"}`,
    `City or home area: ${answers.home?.trim() || "unknown"}`,
  ].join("\n");
}

export function resumePrompt(resumeText: string): string {
  return [
    "Extract job-search preferences from this resume.",
    "Return JSON with titles.include/exclude/prefer, skills.preferred/bonus,",
    "and profile.years_experience, profile.current_title, profile.home, profile.skills when visible.",
    "Use null for unknown profile fields. Prefer weights are small numbers (1-3).",
    "Keep lists short. Do not invent employers or salaries.",
    "",
    "Resume:",
    resumeText.slice(0, 15_000),
  ].join("\n");
}

/** Which follow-up questions are still needed after a resume parse. */
export function missingResumeQuestions(partial: {
  yearsExperience?: number | null;
  currentTitle?: string | null;
  targetSalaryUsd?: number | null;
  skills?: string[] | null;
  home?: string | null;
}): Array<"years" | "title" | "salary" | "skills" | "home"> {
  const missing: Array<"years" | "title" | "salary" | "skills" | "home"> = [];
  if (partial.yearsExperience == null || !Number.isFinite(partial.yearsExperience)) missing.push("years");
  if (!partial.currentTitle?.trim()) missing.push("title");
  if (partial.targetSalaryUsd == null || !(partial.targetSalaryUsd > 0)) missing.push("salary");
  if (!partial.skills?.length) missing.push("skills");
  if (!partial.home?.trim()) missing.push("home");
  return missing;
}
