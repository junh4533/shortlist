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
      key === "embed" ||
      key === "oga"
    ) {
      parsed.searchParams.delete(key);
    }
  }
}

/**
 * Canonical apply URL: strip tracking params, alias Greenhouse hosts, drop Lever/Workable /apply.
 * Path case is preserved because some boards are case-sensitive (jobs.lever.co/AIFund).
 */
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
    let path = parsed.pathname.replace(/\/+$/, "");
    if (host === "jobs.lever.co" || host === "apply.workable.com") {
      path = path.replace(/\/apply$/i, "");
    }
    parsed.pathname = path || "/";
    stripTrackingParams(parsed);
    let href = parsed.toString();
    if (href.endsWith("/")) href = href.slice(0, -1);
    return href;
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

/** Identity for dedupe: provider-native ids where they are globally unique, else the normalized URL. Per-ATS, not cross-ATS. */
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
    const ghParam = parsed.searchParams.get("gh_jid");
    const greenhouseId =
      ghParam ||
      (provider === "greenhouse" || host.endsWith("greenhouse.io")
        ? path.match(/\/jobs\/(\d+)/)?.[1]
        : undefined);
    if (greenhouseId) return `greenhouse:${greenhouseId}`;
    const uuid = path.match(UUID_RE)?.[0]?.toLowerCase();
    if (uuid && (provider === "ashby" || host === "jobs.ashbyhq.com")) {
      return `ashby:${uuid}`;
    }
    if (uuid && (provider === "lever" || host === "jobs.lever.co")) {
      return `lever:${uuid}`;
    }
    if (host === "apply.workable.com") {
      const shortcode = path.match(/\/j\/([a-z0-9]+)/)?.[1];
      if (shortcode) return `workable:${shortcode}`;
    }
    if (host === "jobs.smartrecruiters.com") {
      const postingId = path.match(/\/(\d{6,})(?:-|$)/)?.[1];
      if (postingId) return `smartrecruiters:${postingId}`;
    }
  } catch {
    /* fall through */
  }
  if (provider === "greenhouse" && /^\d+$/.test(externalId)) {
    return `greenhouse:${externalId}`;
  }
  if (
    (provider === "ashby" ||
      provider === "lever" ||
      provider === "workable" ||
      provider === "smartrecruiters" ||
      provider === "recruitee") &&
    externalId
  ) {
    return `${provider}:${externalId}`;
  }
  // BambooHR ids are only unique per company, so the subdomain URL is the identity.
  return normalizeJobUrl(job.url).toLowerCase() || `${provider}:${externalId}`;
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
