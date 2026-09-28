/** Normalize apply URLs and build keys used to treat duplicate postings as one job. */
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function stripTrackingParams(parsed: URL) {
  for (const key of [...parsed.searchParams.keys()]) {
    if (
      key.startsWith("utm_") ||
      key === "gh_src" ||
      key === "source" ||
      key === "ref" ||
      key === "embed"
    ) {
      parsed.searchParams.delete(key);
    }
  }
}

/** Canonical apply URL: strip UTM, alias Greenhouse hosts, drop Lever /apply. */
export function normalizeJobUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    let host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "boards.greenhouse.io") {
      host = "job-boards.greenhouse.io";
    }
    parsed.hostname = host;
    let path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (host === "jobs.lever.co") {
      path = path.replace(/\/apply$/, "");
    }
    parsed.pathname = path || "/";
    stripTrackingParams(parsed);
    let href = parsed.toString();
    if (href.endsWith("/")) href = href.slice(0, -1);
    return href;
  } catch {
    return trimmed.replace(/\/$/, "").toLowerCase();
  }
}

/** Identity for dedupe: greenhouse:{id}, ashby|lever:{uuid}, else normalized URL. Per-ATS, not cross-ATS. */
export function jobCollapseKey(job: {
  url: string;
  atsProvider: string;
  externalId: string;
}) {
  const provider = job.atsProvider.trim().toLowerCase();
  const externalId = job.externalId.trim().toLowerCase();
  try {
    const parsed = new URL(job.url.trim());
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const greenhouseId =
      parsed.searchParams.get("gh_jid") || path.match(/\/jobs\/(\d+)/)?.[1];
    if (greenhouseId) return `greenhouse:${greenhouseId}`;
    const uuid = path.match(UUID_RE)?.[0]?.toLowerCase();
    if (uuid && (provider === "ashby" || host === "jobs.ashbyhq.com")) {
      return `ashby:${uuid}`;
    }
    if (uuid && (provider === "lever" || host === "jobs.lever.co")) {
      return `lever:${uuid}`;
    }
  } catch {
    /* fall through */
  }
  if (provider === "greenhouse" && /^\d+$/.test(externalId)) {
    return `greenhouse:${externalId}`;
  }
  if (provider === "ashby" && externalId) return `ashby:${externalId}`;
  if (provider === "lever" && externalId) return `lever:${externalId}`;
  return normalizeJobUrl(job.url) || `${provider}:${externalId}`;
}

/** Weaker UI key: same ATS + board + title + location (not used to merge Greenhouse vs Lever). */
export function listingCollapseKey(job: {
  atsProvider: string;
  boardSlug: string;
  title: string;
  location: string | null;
}) {
  const title = job.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const location = (job.location ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${job.atsProvider.toLowerCase()}|${job.boardSlug.toLowerCase()}|${title}|${location}`;
}
