"use client";

/** Five-step onboarding (roles, location, pay, skills, seniority) with optional resume-paste prefill. */

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import type { UserPreferences } from "@/lib/config";
import { completeOnboarding, prefillFromResume, type SaveState } from "../settings/actions";
import { LocationSection, PaySection, RolesSection, SenioritySection, SkillsSection } from "../settings/preference-fields";
import { PreviewPanel, usePreview } from "../settings/settings-form";

const STEPS = ["Roles", "Location", "Pay", "Skills", "Seniority"] as const;

export function OnboardingForm({
  initial,
  locationSuggestions,
}: {
  initial: UserPreferences;
  locationSuggestions: string[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [resume, setResume] = useState("");
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const [state, formAction, saving] = useActionState<SaveState, FormData>(completeOnboarding, { status: "idle" });
  const { preview, pending } = usePreview(draft);
  const errors = state.status === "error" ? state.fieldErrors : {};
  const props = { draft, update: setDraft, errors };

  useEffect(() => {
    if (state.status === "saved") router.push("/");
  }, [state, router]);

  async function prefill() {
    const { skills, titles } = await prefillFromResume(resume, draft.skills.aliases);
    const merge = (current: string[], extra: string[]) => [
      ...current,
      ...extra.filter((item) => !current.some((existing) => existing.toLowerCase() === item.toLowerCase())),
    ];
    setDraft({
      ...draft,
      titles: { ...draft.titles, include: merge(draft.titles.include, titles) },
      skills: { ...draft.skills, preferred: merge(draft.skills.preferred, skills) },
    });
    setPrefillNote(`Added ${titles.length} titles and ${skills.length} skills from your resume.`);
  }

  const section = [
    <RolesSection key="roles" {...props} />,
    <LocationSection key="location" {...props} locationSuggestions={locationSuggestions} />,
    <PaySection key="pay" {...props} />,
    <SkillsSection key="skills" {...props} />,
    <SenioritySection key="seniority" {...props} />,
  ][step];

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <input type="hidden" name="preferences" value={JSON.stringify(draft)} />
      <div className="flex flex-col gap-4">
        <ol className="flex flex-wrap gap-2 text-sm">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(index)}
                className={`rounded-full border px-3 py-1 ${
                  index === step ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700"
                }`}
              >
                {index + 1}. {label}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm">
            <h2 className="text-base font-semibold text-zinc-900">Paste your resume (optional)</h2>
            <p className="mt-0.5 text-zinc-600">We look for known job titles and skills; nothing is sent anywhere else.</p>
            <textarea
              value={resume}
              onChange={(event) => setResume(event.target.value)}
              rows={5}
              className="mt-3 w-full rounded-md border border-zinc-300 p-2"
              placeholder="Paste resume text here"
            />
            <button
              type="button"
              disabled={!resume.trim()}
              onClick={prefill}
              className="mt-2 rounded-md border border-zinc-300 px-3 py-1.5 disabled:opacity-50"
            >
              Prefill titles and skills
            </button>
            {prefillNote ? <p className="mt-2 text-emerald-700">{prefillNote}</p> : null}
          </section>
        ) : null}

        {section}

        <div className="flex items-center gap-3">
          {step > 0 ? (
            <button type="button" onClick={() => setStep(step - 1)} className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
              Back
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <>
              <button type="button" onClick={() => setStep(step + 1)} className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
                Next
              </button>
              <button type="button" onClick={() => setStep(step + 1)} className="text-sm text-zinc-600 underline">
                Skip
              </button>
            </>
          ) : (
            <button type="submit" disabled={saving} className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-60">
              {saving ? "Saving…" : "Finish and see jobs"}
            </button>
          )}
          {state.status === "error" ? <span className="text-sm text-red-600">{state.message}</span> : null}
        </div>
      </div>
      <PreviewPanel preview={preview} pending={pending} />
    </form>
  );
}
