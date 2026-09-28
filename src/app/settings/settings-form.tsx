"use client";

/** Settings form: edits a draft, saves via Server Action with field errors, live preview, YAML import/export. */

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { UserPreferences } from "@/lib/config";
import {
  importPreferencesYaml,
  previewPreferences,
  savePreferences,
  type PreviewResult,
  type SaveState,
} from "./actions";
import {
  AdvancedSection,
  BasicsSection,
  DisplaySection,
  FreshnessSection,
  HiddenPhrasesSection,
  LocationSection,
  PaySection,
  RolesSection,
  SenioritySection,
  SkillsSection,
} from "./preference-fields";

export function usePreview(draft: UserPreferences) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(async () => setPreview(await previewPreferences(draft)));
    }, 400);
    return () => clearTimeout(timer);
  }, [draft]);
  return { preview, pending };
}

export function PreviewPanel({ preview, pending }: { preview: PreviewResult | null; pending: boolean }) {
  return (
    <aside className="rounded-lg border border-zinc-200 bg-white p-4 text-sm lg:sticky lg:top-4">
      <h2 className="font-semibold text-zinc-900">Live preview</h2>
      {!preview ? (
        <p className="mt-2 text-zinc-500">Calculating…</p>
      ) : preview.ok ? (
        <>
          <p className="mt-1 text-zinc-700">
            <span className="text-2xl font-semibold text-zinc-900">{preview.total}</span> jobs match
            {pending ? <span className="ml-2 text-xs text-zinc-400">updating…</span> : null}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {preview.top.map((job) => (
              <li key={job.key} className="border-t border-zinc-100 pt-2">
                <div className="font-medium text-zinc-900">{job.title}</div>
                <div className="text-xs text-zinc-500">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-amber-700">{preview.message}</p>
      )}
    </aside>
  );
}

export function SettingsForm({
  initial,
  locationSuggestions,
}: {
  initial: UserPreferences;
  locationSuggestions: string[];
}) {
  const [draft, setDraft] = useState(initial);
  const [state, formAction, saving] = useActionState<SaveState, FormData>(savePreferences, { status: "idle" });
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const { preview, pending } = usePreview(draft);
  const errors = state.status === "error" ? state.fieldErrors : importErrors;
  const props = { draft, update: setDraft, errors };

  async function importYaml(text: string) {
    const result = await importPreferencesYaml(text);
    if (result.ok) {
      setDraft(result.preferences);
      setImportErrors({});
      setImportMessage("Imported. Review the fields, then save.");
    } else {
      setImportErrors(result.fieldErrors);
      setImportMessage(result.message);
    }
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <input type="hidden" name="preferences" value={JSON.stringify(draft)} />
      <div className="flex flex-col gap-4">
        <BasicsSection {...props} />
        <RolesSection {...props} />
        <LocationSection {...props} locationSuggestions={locationSuggestions} />
        <PaySection {...props} />
        <SkillsSection {...props} />
        <SenioritySection {...props} />
        <FreshnessSection {...props} />
        <HiddenPhrasesSection {...props} />
        <DisplaySection {...props} />
        <AdvancedSection {...props} />

        <section className="rounded-lg border border-zinc-200 bg-white p-5 text-sm">
          <h2 className="text-base font-semibold text-zinc-900">Import / export YAML</h2>
          <p className="mt-0.5 text-zinc-600">Same format as search.config.yaml.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href="/settings/export" className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100">
              Download YAML
            </Link>
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100"
              onClick={() => fileInput.current?.click()}
            >
              Import YAML file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".yaml,.yml,text/yaml"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await importYaml(await file.text());
                event.target.value = "";
              }}
            />
          </div>
          {importMessage ? <p className="mt-2 text-zinc-700">{importMessage}</p> : null}
        </section>

        <div className="sticky bottom-0 flex items-center gap-3 border-t border-zinc-200 bg-zinc-50/95 py-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save preferences"}
          </button>
          <button type="button" className="text-sm text-zinc-600 underline" onClick={() => setDraft(initial)}>
            Reset changes
          </button>
          {state.status === "saved" ? <span className="text-sm text-emerald-700">Saved. The job table is updated.</span> : null}
          {state.status === "error" ? <span className="text-sm text-red-600">{state.message}</span> : null}
        </div>
      </div>
      <PreviewPanel preview={preview} pending={pending} />
    </form>
  );
}
