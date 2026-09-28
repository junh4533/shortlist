/** Guess board slugs from company names/websites and keep only boards that are live and non-empty. */
import { fetchBoard } from "../ats";
import type { AtsProvider } from "../ats/providers";
import { mapPool, sleep } from "../concurrency";
import type { AtsRef } from "./patterns";

const NAME_SUFFIXES =
  /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|technologies|technology|labs|hq|group|holdings)\b\.?/gi;

/** Up to 3 slug guesses: joined, hyphenated, and the website's domain label. */
export function slugCandidates(name?: string, website?: string): string[] {
  const out = new Set<string>();
  if (name) {
    const base = name
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(NAME_SUFFIXES, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (base) {
      out.add(base.replace(/ /g, ""));
      out.add(base.replace(/ /g, "-"));
    }
  }
  if (website) {
    try {
      const host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname;
      const label = host.replace(/^www\./, "").split(".")[0]?.toLowerCase();
      if (label && /^[a-z0-9-]+$/.test(label)) out.add(label);
    } catch {
      /* ignore malformed websites */
    }
  }
  return [...out].filter((slug) => slug.length >= 2).slice(0, 3);
}

export type ProbeTarget = { name?: string; website?: string };
export type ProbeHit = AtsRef & { name?: string; website?: string; jobs: number };

export async function probeTargets(options: {
  targets: ProbeTarget[];
  providers: AtsProvider[];
  userAgent: string;
  known: (provider: AtsProvider, slug: string) => boolean;
  concurrency?: number;
  delayMs?: number;
  onProgress?: (done: number, total: number, hits: number) => void;
}): Promise<ProbeHit[]> {
  const attempts: { provider: AtsProvider; slug: string; target: ProbeTarget }[] = [];
  for (const target of options.targets) {
    for (const slug of slugCandidates(target.name, target.website)) {
      for (const provider of options.providers) {
        if (!options.known(provider, slug)) attempts.push({ provider, slug, target });
      }
    }
  }

  const hits = new Map<string, ProbeHit>();
  let done = 0;
  await mapPool(attempts, options.concurrency ?? 4, async ({ provider, slug, target }) => {
    const result = await fetchBoard(provider, slug, {
      userAgent: options.userAgent,
      withDetails: () => false,
      previouslyLive: false,
    });
    if (result.ok && result.jobs.length > 0) {
      hits.set(`${provider}:${slug}`, {
        atsProvider: provider,
        slug,
        name: target.name,
        website: target.website,
        jobs: result.jobs.length,
      });
    }
    done += 1;
    if (done % 25 === 0 || done === attempts.length) {
      options.onProgress?.(done, attempts.length, hits.size);
    }
    await sleep(options.delayMs ?? 250);
  });
  return [...hits.values()];
}
