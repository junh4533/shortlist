"use client";

/** Hover/focus help for a settings label. */
export function FieldTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={text}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 text-[10px] font-semibold leading-none text-zinc-500 dark:text-zinc-400 hover:border-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-6 left-0 z-20 hidden w-64 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-900 dark:bg-zinc-100 px-2.5 py-2 text-xs font-normal leading-5 text-white dark:text-zinc-900 shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
