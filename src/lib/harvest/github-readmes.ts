/** Pull ATS links out of community job-list READMEs on GitHub (e.g. SimplifyJobs new-grad lists). */
import { extractAtsRefs, type AtsRef } from "./patterns";

export async function harvestGithubReadmes(
  repos: readonly string[],
  userAgent: string,
  onRepo?: (repo: string, found: number, error?: string) => void,
): Promise<AtsRef[]> {
  const found = new Map<string, AtsRef>();
  for (const repo of repos) {
    const url = `https://raw.githubusercontent.com/${repo}/HEAD/README.md`;
    try {
      const response = await fetch(url, { headers: { "User-Agent": userAgent } });
      if (!response.ok) {
        onRepo?.(repo, 0, `HTTP ${response.status}`);
        continue;
      }
      const refs = extractAtsRefs(await response.text());
      for (const ref of refs) found.set(`${ref.atsProvider}:${ref.slug}`, ref);
      onRepo?.(repo, refs.length);
    } catch (error) {
      onRepo?.(repo, 0, (error as Error).message);
    }
  }
  return [...found.values()];
}
