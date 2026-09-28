/** Harvest ATS links from Hacker News "Ask HN: Who is hiring?" threads via the Algolia API. */
import { load } from "cheerio";
import { extractAtsRefs, type AtsRef } from "./patterns";

const SEARCH_URL =
  "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=who%20is%20hiring&hitsPerPage=50";

type HnHit = { objectID: string; title?: string; created_at?: string };
type HnItem = { children?: { text?: string | null }[] };

export type HnRef = AtsRef & { name?: string };

/** Most recent "Who is hiring?" story ids, newest first. */
export async function hiringThreads(months: number, userAgent: string): Promise<HnHit[]> {
  const response = await fetch(SEARCH_URL, { headers: { "User-Agent": userAgent } });
  if (!response.ok) throw new Error(`HN search ${response.status}`);
  const { hits } = (await response.json()) as { hits: HnHit[] };
  return hits
    .filter((hit) => /^Ask HN: Who is hiring\?/i.test(hit.title ?? ""))
    .slice(0, Math.max(1, months));
}

/** Company name from the conventional first line "Company | Role | Location | URL". */
export function companyFromComment(text: string) {
  const firstLine = text.split("\n").find((line) => line.trim()) ?? "";
  const name = firstLine.split("|")[0]?.trim();
  return name && name.length <= 80 && !/^https?:/i.test(name) ? name : undefined;
}

/** HN comment HTML → plain text with hrefs kept (links are often shortened in the visible text). */
export function commentText(html: string) {
  const $ = load(html.replace(/<p>/gi, "\n<p>"));
  const hrefs = $("a")
    .map((_, anchor) => $(anchor).attr("href") ?? "")
    .get()
    .join(" ");
  return `${$.root().text()}\n${hrefs}`;
}

export async function harvestHn(
  months: number,
  userAgent: string,
  onThread?: (title: string, comments: number, found: number) => void,
): Promise<HnRef[]> {
  const found = new Map<string, HnRef>();
  for (const thread of await hiringThreads(months, userAgent)) {
    const response = await fetch(`https://hn.algolia.com/api/v1/items/${thread.objectID}`, {
      headers: { "User-Agent": userAgent },
    });
    if (!response.ok) continue;
    const item = (await response.json()) as HnItem;
    const comments = (item.children ?? []).filter((child) => child.text);
    for (const comment of comments) {
      const text = commentText(comment.text ?? "");
      const name = companyFromComment(text);
      for (const ref of extractAtsRefs(text)) {
        found.set(`${ref.atsProvider}:${ref.slug}`, { ...ref, name });
      }
    }
    onThread?.(thread.title ?? thread.objectID, comments.length, found.size);
  }
  return [...found.values()];
}
