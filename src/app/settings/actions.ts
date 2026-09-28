"use server";

/** Server Actions for /settings and /onboarding: validate + save preferences, live preview, YAML import, resume prefill. */

import { revalidatePath, revalidateTag } from "next/cache";
import { parse as parseYaml } from "yaml";
import { userPreferencesSchema, type UserPreferences } from "@/lib/config";
import { getCurrentUserId } from "@/lib/current-user";
import { listMatchedJobs } from "@/lib/jobs/query";
import { saveUserPreferences } from "@/lib/preferences-store";
import { RateLimitError, rateLimit } from "@/lib/rate-limit";
import { extractFromResume } from "@/lib/skills-vocabulary";

export type SaveState =
  | { status: "idle" }
  | { status: "saved"; at: string }
  | { status: "error"; message: string; fieldErrors: Record<string, string> };

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    errors[key] ??= issue.message;
  }
  return errors;
}

function parseDraft(raw: FormDataEntryValue | null) {
  try {
    return userPreferencesSchema.safeParse(JSON.parse(String(raw ?? "")));
  } catch {
    return null;
  }
}

async function persist(formData: FormData, onboarded: boolean): Promise<SaveState> {
  const parsed = parseDraft(formData.get("preferences"));
  if (!parsed) return { status: "error", message: "Could not read the form.", fieldErrors: {} };
  if (!parsed.success) {
    return {
      status: "error",
      message: "Some fields need attention.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  const userId = await getCurrentUserId();
  try {
    await rateLimit(userId, "write", 60, 60_000);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { status: "error", message: error.message, fieldErrors: {} };
    }
    throw error;
  }
  await saveUserPreferences(userId, parsed.data, { onboarded });
  revalidateTag(`jobs:${userId}`, "max");
  revalidatePath("/", "layout");
  return { status: "saved", at: new Date().toISOString() };
}

export async function savePreferences(_previous: SaveState, formData: FormData): Promise<SaveState> {
  return persist(formData, true);
}

export async function completeOnboarding(_previous: SaveState, formData: FormData): Promise<SaveState> {
  return persist(formData, true);
}

export type PreviewResult =
  | { ok: true; total: number; top: { key: string; title: string; company: string; location: string | null }[] }
  | { ok: false; message: string };

/** Match count and top 5 for an unsaved draft. */
export async function previewPreferences(draft: UserPreferences): Promise<PreviewResult> {
  const parsed = userPreferencesSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, message: "Fix the highlighted fields to see a preview." };
  const userId = await getCurrentUserId();
  try {
    await rateLimit(userId, "preview", 30, 60_000);
  } catch (error) {
    if (error instanceof RateLimitError) return { ok: false, message: error.message };
    throw error;
  }
  const page = await listMatchedJobs({
    userId,
    preferences: parsed.data,
    pageSize: 5,
    grouped: false,
  });
  return {
    ok: true,
    total: page.totalJobs,
    top: page.groups.map(({ primary }) => ({
      key: primary.jobKey,
      title: primary.title,
      company: primary.companyName,
      location: primary.location,
    })),
  };
}

export type ImportResult =
  | { ok: true; preferences: UserPreferences }
  | { ok: false; message: string; fieldErrors: Record<string, string> };

export async function importPreferencesYaml(text: string): Promise<ImportResult> {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    return { ok: false, message: `Not valid YAML: ${(error as Error).message}`, fieldErrors: {} };
  }
  const parsed = userPreferencesSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "The YAML does not match the preferences format.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  return { ok: true, preferences: parsed.data };
}

export async function prefillFromResume(text: string, aliases: UserPreferences["skills"]["aliases"]) {
  return extractFromResume(text.slice(0, 50_000), aliases);
}
