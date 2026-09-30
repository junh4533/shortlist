"use server";

/** Server actions for the starter questionnaire: resume extract, Gemini draft, import. */
import { getCurrentUserId } from "@/lib/current-user";
import { parsePreferencesText, type UserPreferences } from "@/lib/config";
import { generateStarterFromPrompt } from "@/lib/gemini/client";
import { extractResumeText } from "@/lib/gemini/extract-resume";
import type { GeminiStarter } from "@/lib/gemini/schema";
import {
  buildStarterPreferences,
  missingResumeQuestions,
  questionnairePrompt,
  resumePrompt,
  type StarterAnswers,
} from "@/lib/gemini/starter";
import { RateLimitError, rateLimit } from "@/lib/rate-limit";

export type StarterDraftResult =
  | { ok: true; preferences: UserPreferences; usedModel: boolean; note?: string }
  | { ok: false; message: string };

export type ResumeExtractActionResult =
  | {
      ok: true;
      text: string;
      partial: StarterAnswers;
      missing: Array<"years" | "title" | "salary" | "skills" | "home">;
      usedModel: boolean;
      gemini: GeminiStarter | null;
      note?: string;
    }
  | { ok: false; message: string };

async function limitGemini() {
  const userId = await getCurrentUserId();
  try {
    await rateLimit(userId, "gemini", 8, 60 * 60 * 1000);
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new RateLimitError("Too many AI requests. Try again in an hour.");
    }
    throw error;
  }
}

export async function buildDraftFromAnswers(answers: StarterAnswers): Promise<StarterDraftResult> {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return {
      ok: true,
      ...buildStarterPreferences(answers, null),
      note: "The model was not used. Your answers filled the draft.",
    };
  }

  try {
    await limitGemini();
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        ok: true,
        ...buildStarterPreferences(answers, null),
        note: "The model was not used (rate limited). Your answers filled the draft.",
      };
    }
    throw error;
  }

  const gemini = await generateStarterFromPrompt(questionnairePrompt(answers));
  if (!gemini.ok) {
    return {
      ok: true,
      ...buildStarterPreferences(answers, null),
      note: "The model was not used. Your answers filled the draft.",
    };
  }
  return { ok: true, ...buildStarterPreferences(answers, gemini.data) };
}

export async function extractAndAnalyzeResume(formData: FormData): Promise<ResumeExtractActionResult> {
  const pasted = String(formData.get("text") ?? "").trim();
  const file = formData.get("file");

  let text = pasted;
  if ((!text || text.length < 20) && file instanceof File && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractResumeText({ name: file.name, bytes });
    if (!extracted.ok) return { ok: false, message: extracted.message };
    text = extracted.text;
  }

  if (!text.trim()) {
    return { ok: false, message: "Paste your resume or upload a .pdf / .docx file." };
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    return {
      ok: true,
      text: text.slice(0, 15_000),
      partial: {
        yearsExperience: null,
        currentTitle: null,
        targetSalaryUsd: null,
        skills: null,
        home: null,
      },
      missing: missingResumeQuestions({}),
      usedModel: false,
      gemini: null,
      note: "The model was not used. Answer the remaining questions to finish the draft.",
    };
  }

  try {
    await limitGemini();
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  const gemini = await generateStarterFromPrompt(resumePrompt(text));
  const profile = gemini.ok ? gemini.data.profile : undefined;
  const partial: StarterAnswers = {
    yearsExperience: profile?.years_experience ?? null,
    currentTitle: profile?.current_title ?? null,
    targetSalaryUsd: null,
    skills: profile?.skills?.length ? profile.skills : gemini.ok ? gemini.data.skills.preferred : null,
    home: profile?.home ?? null,
  };
  const missing = missingResumeQuestions(partial);

  return {
    ok: true,
    text: text.slice(0, 15_000),
    partial,
    missing,
    usedModel: gemini.ok,
    gemini: gemini.ok ? gemini.data : null,
    note: gemini.ok ? undefined : "The model was not used. Answer the remaining questions to finish the draft.",
  };
}

export async function buildDraftFromResume(
  answers: StarterAnswers,
  geminiJson: unknown | null,
): Promise<StarterDraftResult> {
  const { geminiStarterSchema } = await import("@/lib/gemini/schema");
  const parsed = geminiJson == null ? null : geminiStarterSchema.safeParse(geminiJson);
  const gemini = parsed?.success ? parsed.data : null;
  const result = buildStarterPreferences(answers, gemini);
  return {
    ok: true,
    ...result,
    note: result.usedModel ? undefined : "The model was not used. Your answers filled the draft.",
  };
}

export async function importPreferencesText(text: string): Promise<StarterDraftResult> {
  const parsed = parsePreferencesText(text);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  return { ok: true, preferences: parsed.preferences, usedModel: false };
}
