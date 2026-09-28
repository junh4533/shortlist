/** Find ATS board references (provider + slug) in any text: URLs, HTML, embed scripts, JSON. */
import type { AtsProvider } from "../ats/providers";
import { normalizeSlug } from "../slug";

export type AtsRef = { atsProvider: AtsProvider; slug: string };

const SEGMENT = String.raw`([^/?#&"'\s<>\\)\]]+)`;
const SUBDOMAIN = String.raw`(?:^|[^a-z0-9.-])([a-z0-9][a-z0-9-]*)`;

const PATTERNS: { provider: AtsProvider; regex: RegExp; skip?: Set<string> }[] = [
  {
    provider: "greenhouse",
    regex: new RegExp(String.raw`boards\.greenhouse\.io/embed/job_board(?:/js)?\?(?:[^"'\s<>]*&)?for=${SEGMENT}`, "gi"),
  },
  {
    provider: "greenhouse",
    regex: new RegExp(String.raw`(?:^|[^a-z.])(?:boards|job-boards)\.greenhouse\.io/${SEGMENT}`, "gi"),
  },
  {
    provider: "greenhouse",
    regex: new RegExp(String.raw`boards-api\.greenhouse\.io/v1/boards/${SEGMENT}`, "gi"),
  },
  { provider: "lever", regex: new RegExp(String.raw`(?:^|[^a-z.])jobs\.lever\.co/${SEGMENT}`, "gi") },
  { provider: "lever", regex: new RegExp(String.raw`api\.lever\.co/v0/postings/${SEGMENT}`, "gi") },
  { provider: "ashby", regex: new RegExp(String.raw`jobs\.ashbyhq\.com/${SEGMENT}`, "gi") },
  {
    provider: "ashby",
    regex: new RegExp(String.raw`api\.ashbyhq\.com/posting-api/job-board/${SEGMENT}`, "gi"),
  },
  {
    provider: "smartrecruiters",
    regex: new RegExp(String.raw`(?:jobs|careers)\.smartrecruiters\.com/${SEGMENT}`, "gi"),
  },
  {
    provider: "smartrecruiters",
    regex: new RegExp(String.raw`api\.smartrecruiters\.com/v1/companies/${SEGMENT}`, "gi"),
  },
  {
    provider: "workable",
    regex: new RegExp(String.raw`apply\.workable\.com/(?:api/v1/widget/accounts/)?${SEGMENT}`, "gi"),
    skip: new Set(["j", "api"]),
  },
  {
    provider: "recruitee",
    regex: new RegExp(String.raw`${SUBDOMAIN}\.recruitee\.com`, "gi"),
    skip: new Set(["www", "api", "app", "help", "blog", "careers", "support"]),
  },
  {
    provider: "bamboohr",
    regex: new RegExp(String.raw`${SUBDOMAIN}\.bamboohr\.com`, "gi"),
    skip: new Set(["www", "api", "app", "help", "blog", "marketplace", "partners", "support", "status"]),
  },
];

/** Undo common escaping so URLs inside JSON strings and HTML attributes match. */
function unescapeText(text: string) {
  return text
    .replace(/\\\//g, "/")
    .replace(/&#x2F;|&#47;|%2F/gi, "/")
    .replace(/&#x3D;|&#61;|%3D/gi, "=")
    .replace(/&amp;/gi, "&");
}

export function extractAtsRefs(text: string): AtsRef[] {
  const source = unescapeText(text);
  const found = new Map<string, AtsRef>();
  for (const { provider, regex, skip } of PATTERNS) {
    regex.lastIndex = 0;
    for (const match of source.matchAll(regex)) {
      const raw = match[1]?.replace(/[.,;:!]+$/, "");
      if (!raw || skip?.has(raw.toLowerCase())) continue;
      const slug = normalizeSlug(provider, raw);
      if (!slug) continue;
      found.set(`${provider}:${slug}`, { atsProvider: provider, slug });
    }
  }
  return [...found.values()];
}
