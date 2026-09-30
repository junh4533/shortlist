"use client";

/** Editable sections of UserPreferences, shared by /settings and /onboarding. Each section edits a draft object. */

import type { ReactNode } from "react";
import type { UserPreferences } from "@/lib/config";
import { SKILL_VOCABULARY, TITLE_VOCABULARY } from "@/lib/skills-vocabulary";
import { FieldTip } from "../components/field-tip";
import { TagInput } from "../components/tag-input";
import { nearestLevel, toEntries, toRecord, WEIGHT_LEVELS, type WeightedEntry } from "./weights";

export type SectionProps = {
  draft: UserPreferences;
  update: (next: UserPreferences) => void;
  errors: Record<string, string>;
};

export function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{description}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function errorFor(errors: Record<string, string>, prefix: string) {
  return Object.entries(errors).find(([key]) => key === prefix || key.startsWith(`${prefix}.`))?.[1];
}

function TextField({
  label,
  value,
  onChange,
  error,
  type = "text",
  help,
  tip,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  error?: string;
  type?: "text" | "number";
  help?: string;
  tip?: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
        {label}
        {tip ? <FieldTip text={tip} /> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`rounded-md border bg-white px-3 py-1.5 dark:bg-zinc-950 ${error ? "border-red-400" : "border-zinc-300 dark:border-zinc-700"}`}
      />
      {help ? <span className="text-xs text-zinc-500 dark:text-zinc-400">{help}</span> : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  tip,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  tip?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        {label}
      </label>
      {tip ? <FieldTip text={tip} /> : null}
    </span>
  );
}

function WeightedList({
  label,
  entries,
  onChange,
  suggestions,
  tip,
}: {
  label: string;
  entries: WeightedEntry[];
  onChange: (entries: WeightedEntry[]) => void;
  suggestions?: string[];
  tip?: string;
}) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <TagInput
        label={label}
        tip={tip}
        value={entries.map((entry) => entry.name)}
        suggestions={suggestions}
        onChange={(names) =>
          onChange(names.map((name) => entries.find((entry) => entry.name === name) ?? { name, weight: 2 }))
        }
      />
      {entries.length ? (
        <div className="flex flex-wrap gap-2">
          {entries.map((entry) => (
            <label key={entry.name} className="inline-flex items-center gap-1 rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1">
              <span className="text-zinc-700 dark:text-zinc-300">{entry.name}</span>
              <select
                value={nearestLevel(entry.weight)}
                onChange={(event) =>
                  onChange(entries.map((item) => (item === entry ? { ...item, weight: Number(event.target.value) } : item)))
                }
                className="rounded border border-zinc-300 dark:border-zinc-700 px-1 py-0.5 text-xs"
              >
                {WEIGHT_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function BasicsSection({ draft, update, errors }: SectionProps) {
  const profile = draft.profile;
  return (
    <Card title="Basics">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Name" value={profile.name} error={errors["profile.name"]} onChange={(name) => update({ ...draft, profile: { ...profile, name } })} />
        <TextField label="Home location" value={profile.home} error={errors["profile.home"]} onChange={(home) => update({ ...draft, profile: { ...profile, home } })} />
        <TextField
          label="Years of experience"
          type="number"
          tip="Saved on your profile only. It does not filter or rank jobs."
          value={profile.years_experience}
          error={errors["profile.years_experience"]}
          onChange={(value) => update({ ...draft, profile: { ...profile, years_experience: Number(value) } })}
        />
      </div>
    </Card>
  );
}

export function RolesSection({ draft, update, errors }: SectionProps) {
  const titles = draft.titles;
  return (
    <Card title="Roles" description="Job titles to look for and to skip.">
      <TagInput
        label="Include titles containing"
        tip="A job is shown only if its title contains one of these phrases. This is the on/off filter."
        value={titles.include}
        suggestions={TITLE_VOCABULARY}
        error={errorFor(errors, "titles.include")}
        onChange={(include) => update({ ...draft, titles: { ...titles, include } })}
        placeholder="Frontend, Full Stack…"
      />
      <TagInput
        label="Exclude titles containing"
        tip="Hidden even when the title also matches an include phrase. Matched as whole words."
        value={titles.exclude}
        error={errorFor(errors, "titles.exclude")}
        onChange={(exclude) => update({ ...draft, titles: { ...titles, exclude } })}
        placeholder="Manager, Intern…"
      />
      <WeightedList
        label="Preferred tracks"
        tip="Does not hide jobs. After a job passes the include list, a matching track moves it up. High weighs more than low. A match in the title counts more than the same word in the description."
        entries={toEntries(titles.prefer)}
        onChange={(entries) => update({ ...draft, titles: { ...titles, prefer: toRecord(entries) } })}
      />
    </Card>
  );
}

export function LocationSection({ draft, update, errors, locationSuggestions }: SectionProps & { locationSuggestions: string[] }) {
  const locations = draft.locations;
  const set = (patch: Partial<UserPreferences["locations"]>) => update({ ...draft, locations: { ...locations, ...patch } });
  return (
    <Card title="Location" description="Work modes and places you would accept.">
      <div className="flex flex-wrap gap-4">
        <Checkbox label="Remote" checked={locations.remote_ok} onChange={(remote_ok) => set({ remote_ok })} />
        <Checkbox label="Hybrid" checked={locations.hybrid_ok} onChange={(hybrid_ok) => set({ hybrid_ok })} />
        <Checkbox label="On-site" checked={locations.onsite_ok} onChange={(onsite_ok) => set({ onsite_ok })} />
        <Checkbox
          label="US only"
          tip="Hides jobs whose location is explicitly outside the US, including remote roles limited to another country. “Remote” with no country still shows."
          checked={locations.us_only}
          onChange={(us_only) => set({ us_only })}
        />
      </div>
      <TagInput
        label="Include locations"
        value={locations.include}
        suggestions={locationSuggestions}
        error={errorFor(errors, "locations.include")}
        onChange={(include) => set({ include })}
        tip="Hybrid and on-site jobs must match one of these. Remote jobs do not, unless US only is on."
      />
      <TagInput
        label="Exclude locations"
        value={locations.exclude}
        suggestions={locationSuggestions}
        error={errorFor(errors, "locations.exclude")}
        onChange={(exclude) => set({ exclude })}
      />
    </Card>
  );
}

export function PaySection({ draft, update, errors }: SectionProps) {
  const pay = draft.pay;
  const set = (patch: Partial<UserPreferences["pay"]>) => update({ ...draft, pay: { ...pay, ...patch } });
  return (
    <Card title="Pay" description="Jobs listing a salary below your minimum are hidden.">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Minimum (USD / year)" type="number" value={pay.min_usd} error={errors["pay.min_usd"]} onChange={(value) => set({ min_usd: Number(value) })} />
        <TextField label="Maximum (USD / year)" type="number" value={pay.max_usd} error={errors["pay.max_usd"]} onChange={(value) => set({ max_usd: Number(value) })} />
      </div>
      <Checkbox label="Only show jobs that list a salary" checked={pay.require_listed_salary} onChange={(require_listed_salary) => set({ require_listed_salary })} />
    </Card>
  );
}

export function SkillsSection({ draft, update, errors }: SectionProps) {
  const skills = draft.skills;
  const set = (patch: Partial<UserPreferences["skills"]>) => update({ ...draft, skills: { ...skills, ...patch } });
  return (
    <Card title="Skills" description="Matched against the job description.">
      <TagInput label="Required (every one must appear)" tip="The job is hidden unless every required skill appears in the title or description. Leave this empty to require none." value={skills.required} suggestions={SKILL_VOCABULARY} error={errorFor(errors, "skills.required")} onChange={(required) => set({ required })} />
      <TagInput label="Preferred" tip="The job must mention at least the minimum number below. Extra matches rank it higher, but do not hide it." value={skills.preferred} suggestions={SKILL_VOCABULARY} error={errorFor(errors, "skills.preferred")} onChange={(preferred) => set({ preferred })} />
      <TagInput label="Bonus (ranking only)" tip="Never hides a job. Each bonus skill found adds a small amount to the score." value={skills.bonus} suggestions={SKILL_VOCABULARY} error={errorFor(errors, "skills.bonus")} onChange={(bonus) => set({ bonus })} />
      <div className="flex items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
          Minimum preferred matches
          <FieldTip text="How many preferred skills must appear. 0 means preferred skills only affect sorting." />
        </span>
        <button type="button" className="rounded border border-zinc-300 dark:border-zinc-700 px-2" onClick={() => set({ min_preferred_hits: Math.max(0, skills.min_preferred_hits - 1) })}>
          −
        </button>
        <span className="w-6 text-center">{skills.min_preferred_hits}</span>
        <button type="button" className="rounded border border-zinc-300 dark:border-zinc-700 px-2" onClick={() => set({ min_preferred_hits: skills.min_preferred_hits + 1 })}>
          +
        </button>
      </div>
    </Card>
  );
}

const LEVELS = ["intern", "junior", "mid", "mid-senior", "senior", "staff", "principal", "unleveled"];

export function SenioritySection({ draft, update, errors }: SectionProps) {
  const seniority = draft.seniority;
  const set = (patch: Partial<UserPreferences["seniority"]>) => update({ ...draft, seniority: { ...seniority, ...patch } });
  return (
    <Card title="Seniority" description="Preferred levels rank higher; excluded levels are hidden.">
      <WeightedList
        label="Preferred levels"
        tip="Does not hide jobs. A preferred level in the title ranks the job higher. High weighs more than low. “Unleveled” matches titles that name no level."
        entries={toEntries(seniority.prefer)}
        suggestions={LEVELS}
        onChange={(entries) => set({ prefer: toRecord(entries) })}
      />
      <TagInput label="Exclude levels" tip="Hidden when the title contains one of these levels, even if the rest of the title matches." value={seniority.exclude} suggestions={LEVELS} error={errorFor(errors, "seniority.exclude")} onChange={(exclude) => set({ exclude })} />
      <Checkbox label="Level must appear in the title" tip="Hides titles that do not name one of your preferred levels. Titles with no level still pass if “unleveled” is preferred." checked={seniority.require_in_title} onChange={(require_in_title) => set({ require_in_title })} />
    </Card>
  );
}

export function FreshnessSection({ draft, update }: SectionProps) {
  const freshness = draft.freshness;
  const set = (patch: Partial<UserPreferences["freshness"]>) => update({ ...draft, freshness: { ...freshness, ...patch } });
  return (
    <Card title="Freshness">
      <label className="flex items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
          Posted within
          <FieldTip text="Hides jobs older than this. Jobs with no date stay visible unless you hide unknown dates." />
        </span>
        <select
          value={freshness.max_age_days}
          onChange={(event) => set({ max_age_days: Number(event.target.value) })}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1"
        >
          {[7, 14, 21, 30, 0].map((days) => (
            <option key={days} value={days}>
              {days ? `${days} days` : "Any time"}
            </option>
          ))}
          {![7, 14, 21, 30, 0].includes(freshness.max_age_days) ? (
            <option value={freshness.max_age_days}>{freshness.max_age_days} days</option>
          ) : null}
        </select>
      </label>
      <Checkbox label="Hide jobs with an unknown posting date" tip="Only applies together with “Posted within.” Jobs that never list a date are removed." checked={freshness.hide_unknown_date} onChange={(hide_unknown_date) => set({ hide_unknown_date })} />
    </Card>
  );
}

export function HiddenPhrasesSection({ draft, update, errors }: SectionProps) {
  return (
    <Card title="Hidden phrases" description="Hide jobs whose title or description contains any of these.">
      <TagInput
        label="Phrases"
        value={draft.exclude_phrases}
        error={errorFor(errors, "exclude_phrases")}
        onChange={(exclude_phrases) => update({ ...draft, exclude_phrases })}
        placeholder="security clearance, relocation required…"
        tip="Hidden when the title or description contains the phrase as a whole word. This is separate from title excludes."
      />
    </Card>
  );
}

export function DisplaySection({ draft, update }: SectionProps) {
  return (
    <Card title="Display">
      <Checkbox
        label="Group likely duplicates across job boards (rows are never hidden)"
        tip="The same role on two boards stays as two rows, stacked together. You can mark a pair as the same job or not. Turning this off shows a flat list."
        checked={draft.group_duplicates}
        onChange={(group_duplicates) => update({ ...draft, group_duplicates })}
      />
    </Card>
  );
}

function AliasEditor({
  label,
  value,
  onChange,
  tip,
}: {
  label: string;
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  tip?: string;
}) {
  const entries = Object.entries(value);
  return (
    <div className="flex flex-col gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {label}
        {tip ? <FieldTip text={tip} /> : null}
      </span>
      {entries.map(([key, variants]) => (
        <div key={key} className="flex flex-col gap-1 rounded-md border border-zinc-200 dark:border-zinc-800 p-2">
          <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-mono">{key}</span>
            <button
              type="button"
              className="underline"
              onClick={() => onChange(Object.fromEntries(entries.filter(([other]) => other !== key)))}
            >
              Remove
            </button>
          </div>
          <TagInput label={`Also matches for "${key}"`} value={variants} onChange={(next) => onChange({ ...value, [key]: next })} />
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs"
        onClick={() => {
          const key = window.prompt("Alias key (e.g. react)")?.trim().toLowerCase();
          if (key && !value[key]) onChange({ ...value, [key]: [key] });
        }}
      >
        Add alias
      </button>
    </div>
  );
}

export function AdvancedSection({ draft, update, errors }: SectionProps) {
  return (
    <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <summary className="cursor-pointer text-base font-semibold text-zinc-900 dark:text-zinc-100">Advanced</summary>
      <div className="mt-4 flex flex-col gap-5">
        <AliasEditor label="Title aliases" tip="Other phrases that count as a title include, exclude, or track. “react engineer” can count as the frontend track." value={draft.titles.aliases} onChange={(aliases) => update({ ...draft, titles: { ...draft.titles, aliases } })} />
        <AliasEditor label="Skill aliases" tip="Other spellings that count as a skill. “reactjs” can count as React in required, preferred, and bonus checks." value={draft.skills.aliases} onChange={(aliases) => update({ ...draft, skills: { ...draft.skills, aliases } })} />
        <AliasEditor label="Seniority aliases" tip="Other words that count as a level. “sr” can count as senior for both ranking and excludes." value={draft.seniority.aliases} onChange={(aliases) => update({ ...draft, seniority: { ...draft.seniority, aliases } })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Pay buffer above minimum (USD)"
            type="number"
            value={draft.pay.min_max_buffer_usd}
            error={errors["pay.min_max_buffer_usd"]}
            tip="Hides a job when its listed maximum is at or below your minimum plus this amount. Jobs with no salary are unaffected."
            onChange={(value) => update({ ...draft, pay: { ...draft.pay, min_max_buffer_usd: Number(value) } })}
          />
          <TextField
            label="Recency bonus"
            type="number"
            value={draft.freshness.recency_bonus}
            error={errors["freshness.recency_bonus"]}
            tip="Points added for a job posted today. The bonus falls to zero at the “Posted within” age. It only changes sort order."
            onChange={(value) => update({ ...draft, freshness: { ...draft.freshness, recency_bonus: Number(value) } })}
          />
        </div>
      </div>
    </details>
  );
}
