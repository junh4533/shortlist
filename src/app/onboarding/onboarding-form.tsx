"use client";

/** Animated first-run: questions, resume (+ follow-ups), or config import → review → save. */

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { UserPreferences } from "@/lib/config";
import type { GeminiStarter } from "@/lib/gemini/schema";
import type { StarterAnswers } from "@/lib/gemini/starter";
import { TagInput } from "../components/tag-input";
import { completeOnboarding, type SaveState } from "../settings/actions";
import {
  LocationSection,
  PaySection,
  RolesSection,
  SenioritySection,
  SkillsSection,
} from "../settings/preference-fields";
import { PreviewPanel, usePreview } from "../settings/settings-form";
import {
  buildDraftFromAnswers,
  buildDraftFromResume,
  extractAndAnalyzeResume,
  importPreferencesText,
} from "./actions";

type Mode = "choose" | "questions" | "resume" | "import" | "review";
type QuestionId = "years" | "title" | "salary" | "skills" | "home";

const QUESTION_ORDER: QuestionId[] = ["years", "title", "salary", "skills", "home"];

const QUESTION_COPY: Record<QuestionId, { title: string; help: string }> = {
  years: { title: "How many years of experience do you have?", help: "Whole numbers are fine." },
  title: { title: "What is your current title?", help: "Or the role you want next." },
  salary: { title: "What yearly salary are you targeting?", help: "USD, before equity." },
  skills: { title: "What are your top skills?", help: "Press Enter after each skill." },
  home: { title: "Where is home base?", help: "City or metro area. Remote is added automatically." },
};

function StepShell({
  progress,
  children,
  stepKey,
}: {
  progress: number;
  children: React.ReactNode;
  stepKey: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div className="h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-zinc-900 transition-[width] duration-300 dark:bg-zinc-100"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div key={stepKey} className="onboard-step">
        {children}
      </div>
    </div>
  );
}

export function OnboardingForm({
  initial,
  locationSuggestions,
}: {
  initial: UserPreferences;
  locationSuggestions: string[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [answers, setAnswers] = useState<StarterAnswers>({
    yearsExperience: null,
    currentTitle: "",
    targetSalaryUsd: null,
    skills: [],
    home: "",
  });
  const [questionIds, setQuestionIds] = useState<QuestionId[]>(QUESTION_ORDER);
  const [qIndex, setQIndex] = useState(0);
  const [draft, setDraft] = useState<UserPreferences>(initial);
  const [modelNote, setModelNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [showResumePaste, setShowResumePaste] = useState(false);
  const [resumeDragOver, setResumeDragOver] = useState(false);
  const [resumeGemini, setResumeGemini] = useState<GeminiStarter | null>(null);
  const [importText, setImportText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const importFile = useRef<HTMLInputElement>(null);
  const [state, formAction, saving] = useActionState<SaveState, FormData>(completeOnboarding, { status: "idle" });
  const { preview, pending: previewPending } = usePreview(draft);
  const errors = state.status === "error" ? state.fieldErrors : {};
  const props = { draft, update: setDraft, errors };

  useEffect(() => {
    if (state.status === "saved") router.push("/jobs");
  }, [state, router]);

  const currentQuestion = questionIds[qIndex];

  function goReview(preferences: UserPreferences, note?: string) {
    setDraft(preferences);
    setModelNote(note ?? null);
    setMode("review");
    setError(null);
    setFieldError(null);
  }

  function questionError(id: QuestionId, value: StarterAnswers): string | null {
    switch (id) {
      case "years":
        if (value.yearsExperience == null || Number.isNaN(value.yearsExperience)) {
          return "Enter your years of experience to continue.";
        }
        return null;
      case "title":
        if (!value.currentTitle?.trim()) return "Enter your current or target title to continue.";
        return null;
      case "salary":
        if (value.targetSalaryUsd == null || Number.isNaN(value.targetSalaryUsd)) {
          return "Enter a target salary to continue.";
        }
        return null;
      case "skills":
        if (!value.skills?.length) return "Add at least one skill to continue.";
        return null;
      case "home":
        if (!value.home?.trim()) return "Enter your home base to continue.";
        return null;
      default:
        return null;
    }
  }

  function finishQuestions() {
    startTransition(async () => {
      setError(null);
      if (resumeGemini || mode === "resume") {
        const result = await buildDraftFromResume(answers, resumeGemini);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        goReview(result.preferences, result.note);
        return;
      }
      const result = await buildDraftFromAnswers(answers);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      goReview(result.preferences, result.note);
    });
  }

  function nextQuestion() {
    if (!currentQuestion) return;
    const invalid = questionError(currentQuestion, answers);
    if (invalid) {
      setFieldError(invalid);
      return;
    }
    setFieldError(null);
    if (qIndex >= questionIds.length - 1) {
      finishQuestions();
      return;
    }
    setQIndex((index) => index + 1);
  }

  async function onResumeSubmit(file?: File | null) {
    setError(null);
    const formData = new FormData();
    formData.set("text", resumeText);
    if (file) formData.set("file", file);
    startTransition(async () => {
      const result = await extractAndAnalyzeResume(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setResumeText(result.text);
      setResumeGemini(result.gemini);
      setAnswers((current) => ({
        ...current,
        yearsExperience: result.partial.yearsExperience ?? current.yearsExperience,
        currentTitle: result.partial.currentTitle ?? current.currentTitle,
        skills: result.partial.skills?.length ? result.partial.skills : current.skills,
        home: result.partial.home ?? current.home,
      }));
      if (result.note) setModelNote(result.note);
      if (result.missing.length === 0) {
        const built = await buildDraftFromResume(
          {
            yearsExperience: result.partial.yearsExperience,
            currentTitle: result.partial.currentTitle,
            targetSalaryUsd: null,
            skills: result.partial.skills,
            home: result.partial.home,
          },
          result.gemini,
        );
        if (built.ok) goReview(built.preferences, built.note ?? result.note);
        return;
      }
      setQuestionIds(result.missing);
      setQIndex(0);
      setMode("questions");
    });
  }

  function onImport() {
    startTransition(async () => {
      setError(null);
      const result = await importPreferencesText(importText);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      goReview(result.preferences);
    });
  }

  if (mode === "choose") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">How do you want to start?</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            We build a personal search from your answers. You can edit everything later.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {[
              { id: "questions" as const, label: "Answer a few questions" },
              { id: "resume" as const, label: "Use a resume" },
              { id: "import" as const, label: "Import a config file" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setMode(option.id);
                  setError(null);
                  if (option.id === "questions") {
                    setQuestionIds(QUESTION_ORDER);
                    setQIndex(0);
                    setResumeGemini(null);
                  }
                }}
                className="rounded-md border border-zinc-300 bg-white px-4 py-3 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "resume") {
    const canContinue = Boolean(resumeFile) || Boolean(resumeText.trim());

    function acceptResumeFile(file: File | undefined | null) {
      if (!file) return;
      const name = file.name.toLowerCase();
      const okType =
        name.endsWith(".pdf") ||
        name.endsWith(".docx") ||
        file.type === "application/pdf" ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (!okType) {
        setError("Please choose a .pdf or .docx file.");
        return;
      }
      setError(null);
      setResumeFile(file);
    }

    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
        <StepShell progress={0.2} stepKey="resume">
          <h1 className="text-2xl font-semibold tracking-tight">Use a resume</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Upload a .pdf or .docx, or paste the text. Resume text is sent to Google to draft your search.
          </p>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setResumeDragOver(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setResumeDragOver(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setResumeDragOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setResumeDragOver(false);
              acceptResumeFile(event.dataTransfer.files?.[0]);
            }}
            className={`mt-4 flex w-full flex-col items-center justify-center rounded-md border border-dashed px-4 py-10 text-center transition-colors ${
              resumeDragOver
                ? "border-zinc-500 bg-zinc-100 dark:border-zinc-400 dark:bg-zinc-800"
                : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/80"
            }`}
          >
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {resumeFile ? resumeFile.name : "Drop your resume here"}
            </span>
            <span className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {resumeFile ? "Click to choose a different .pdf or .docx" : "or click to browse · .pdf or .docx"}
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => {
              acceptResumeFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {showResumePaste ? (
            <textarea
              value={resumeText}
              onChange={(event) => setResumeText(event.target.value)}
              rows={10}
              className="mt-4 w-full rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              placeholder="Paste resume text here"
            />
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!showResumePaste ? (
              <button
                type="button"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
                onClick={() => setShowResumePaste(true)}
              >
                Paste text instead
              </button>
            ) : null}
            <button
              type="button"
              disabled={pending || !canContinue}
              onClick={() => void onResumeSubmit(resumeFile)}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {pending ? "Reading…" : "Continue"}
            </button>
            <button type="button" className="text-sm underline text-zinc-600 dark:text-zinc-400" onClick={() => setMode("choose")}>
              Back
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </StepShell>
      </div>
    );
  }

  if (mode === "import") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
        <StepShell progress={0.5} stepKey="import">
          <h1 className="text-2xl font-semibold tracking-tight">Import a config file</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Paste JSON or YAML in the preferences format, or choose a .json / .yaml file.
          </p>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            rows={12}
            className="mt-4 w-full rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="Paste JSON or YAML"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
              onClick={() => importFile.current?.click()}
            >
              Choose file
            </button>
            <input
              ref={importFile}
              type="file"
              accept=".json,.yaml,.yml,application/json,text/yaml"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) setImportText(await file.text());
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={pending || !importText.trim()}
              onClick={onImport}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {pending ? "Importing…" : "Review"}
            </button>
            <button type="button" className="text-sm underline text-zinc-600 dark:text-zinc-400" onClick={() => setMode("choose")}>
              Back
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </StepShell>
      </div>
    );
  }

  if (mode === "questions" && currentQuestion) {
    const copy = QUESTION_COPY[currentQuestion];
    const progress = (qIndex + 1) / (questionIds.length + 1);
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
        <StepShell progress={progress} stepKey={currentQuestion}>
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.help}</p>
          <div className="mt-6">
            {currentQuestion === "years" ? (
              <input
                type="number"
                min={0}
                max={60}
                required
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "question-error" : undefined}
                value={answers.yearsExperience ?? ""}
                onChange={(event) => {
                  setFieldError(null);
                  setAnswers((current) => ({
                    ...current,
                    yearsExperience: event.target.value === "" ? null : Number(event.target.value),
                  }));
                }}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-lg dark:border-zinc-700 dark:bg-zinc-900"
              />
            ) : null}
            {currentQuestion === "title" ? (
              <input
                type="text"
                required
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "question-error" : undefined}
                value={answers.currentTitle ?? ""}
                onChange={(event) => {
                  setFieldError(null);
                  setAnswers((current) => ({ ...current, currentTitle: event.target.value }));
                }}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-lg dark:border-zinc-700 dark:bg-zinc-900"
              />
            ) : null}
            {currentQuestion === "salary" ? (
              <input
                type="number"
                min={0}
                step={1000}
                required
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "question-error" : undefined}
                value={answers.targetSalaryUsd ?? ""}
                onChange={(event) => {
                  setFieldError(null);
                  setAnswers((current) => ({
                    ...current,
                    targetSalaryUsd: event.target.value === "" ? null : Number(event.target.value),
                  }));
                }}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-lg dark:border-zinc-700 dark:bg-zinc-900"
              />
            ) : null}
            {currentQuestion === "skills" ? (
              <TagInput
                label="Skills"
                value={answers.skills ?? []}
                onChange={(skills) => {
                  setFieldError(null);
                  setAnswers((current) => ({ ...current, skills }));
                }}
                placeholder="React, TypeScript…"
              />
            ) : null}
            {currentQuestion === "home" ? (
              <input
                type="text"
                required
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "question-error" : undefined}
                value={answers.home ?? ""}
                onChange={(event) => {
                  setFieldError(null);
                  setAnswers((current) => ({ ...current, home: event.target.value }));
                }}
                list="home-suggestions"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-lg dark:border-zinc-700 dark:bg-zinc-900"
              />
            ) : null}
            <datalist id="home-suggestions">
              {locationSuggestions.slice(0, 40).map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>
          {fieldError ? (
            <p id="question-error" className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {fieldError}
            </p>
          ) : null}
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              onClick={() => {
                setFieldError(null);
                if (qIndex === 0) {
                  setMode(resumeGemini ? "resume" : "choose");
                  return;
                }
                setQIndex((index) => index - 1);
              }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={nextQuestion}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {pending ? "Building…" : qIndex >= questionIds.length - 1 ? "Build draft" : "Next"}
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </StepShell>
      </div>
    );
  }

  return (
    <form action={formAction} className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_18rem]">
      <input type="hidden" name="preferences" value={JSON.stringify(draft)} />
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review your search</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Edit anything below, then open the job list.
          </p>
          {modelNote ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{modelNote}</p> : null}
        </div>
        <RolesSection {...props} />
        <PaySection {...props} />
        <SkillsSection {...props} />
        <SenioritySection {...props} />
        <LocationSection {...props} locationSuggestions={locationSuggestions} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving ? "Saving…" : "Use these settings"}
          </button>
          <button type="button" className="text-sm underline text-zinc-600 dark:text-zinc-400" onClick={() => setMode("choose")}>
            Start over
          </button>
          {state.status === "error" ? <span className="text-sm text-red-600">{state.message}</span> : null}
        </div>
      </div>
      <PreviewPanel preview={preview} pending={previewPending} />
    </form>
  );
}
