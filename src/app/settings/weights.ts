/** Low/medium/high weights for `prefer` lists, on the same 1–3 scale the matcher already uses. */

export const WEIGHT_LEVELS = [
  { label: "Low", value: 1 },
  { label: "Medium", value: 2 },
  { label: "High", value: 3 },
] as const;

export type WeightedEntry = { name: string; weight: number };

/** `prefer` may be a ranked list (first = highest) or a name→weight record. */
export function toEntries(prefer: string[] | Record<string, number>): WeightedEntry[] {
  if (Array.isArray(prefer)) {
    return prefer.map((name, index) => ({ name, weight: Math.max(1, Math.min(3, prefer.length - index)) }));
  }
  return Object.entries(prefer).map(([name, weight]) => ({ name, weight }));
}

export function toRecord(entries: WeightedEntry[]): Record<string, number> {
  return Object.fromEntries(entries.filter((entry) => entry.name.trim()).map((entry) => [entry.name.trim(), entry.weight]));
}

export function nearestLevel(weight: number) {
  return WEIGHT_LEVELS.reduce((best, level) =>
    Math.abs(level.value - weight) < Math.abs(best.value - weight) ? level : best,
  ).value;
}
