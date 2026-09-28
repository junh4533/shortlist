"use client";

/** Chip input for string lists: Enter or comma adds, Backspace on empty removes, optional suggestions. */

import { useId, useState, type KeyboardEvent } from "react";

export function TagInput({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder,
  error,
  help,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  error?: string;
  help?: string;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const listId = useId();

  function add(raw: string) {
    const items = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !value.some((existing) => existing.toLowerCase() === item.toLowerCase()));
    if (items.length) onChange([...value, ...items]);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={inputId} className="font-medium text-zinc-800">
        {label}
      </label>
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-md border bg-white px-2 py-1.5 ${
          error ? "border-red-400" : "border-zinc-300"
        }`}
      >
        {value.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-800"
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              className="text-zinc-500 hover:text-zinc-900"
              onClick={() => onChange(value.filter((existing) => existing !== item))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={inputId}
          list={suggestions.length ? listId : undefined}
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          className="min-w-[8rem] flex-1 border-none bg-transparent px-1 py-0.5 outline-none"
        />
        {suggestions.length ? (
          <datalist id={listId}>
            {suggestions.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        ) : null}
      </div>
      {help ? <p className="text-xs text-zinc-500">{help}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
