/** Broad storage allowlist: which job titles are worth caching for any user. */

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a case-insensitive whole-word matcher from ingest.store_title_allowlist. Empty list allows everything. */
export function makeTitleAllowlist(words: readonly string[]) {
  const terms = words.map((word) => word.trim()).filter(Boolean);
  if (!terms.length) return () => true;
  const pattern = new RegExp(
    `(^|[^a-z0-9])(${terms.map((term) => escapeRegex(term.toLowerCase())).join("|")})($|[^a-z0-9])`,
    "i",
  );
  return (title: string) => pattern.test(title.toLowerCase());
}
