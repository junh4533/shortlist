/** Strip HTML (Greenhouse job bodies) down to plain text. */
import { load } from "cheerio";

function unescapeEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function stripHtml(html: string | null | undefined) {
  if (!html) return "";
  const decoded = unescapeEntities(html);
  const $ = load(decoded);
  return $.text().replace(/\s+/g, " ").trim();
}
