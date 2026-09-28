/** Reduce any host or URL to its registrable domain (eTLD+1) using the Public Suffix List. */
import { getDomain, getPublicSuffix } from "tldts";

export function toRegistrableDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  if (!/^[a-z]+:\/\//.test(value)) value = `http://${value}`;
  let host: string;
  try {
    host = new URL(value).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "").replace(/^www\./, "");
  if (!host || /^[\d.]+$/.test(host) || host.includes(":")) return null;
  const domain = getDomain(host, { allowPrivateDomains: false });
  return domain ? domain.toLowerCase() : null;
}

/** Registrable domains of ATS and job platforms: never a company's own website. */
export const JOB_PLATFORM_DOMAINS = new Set([
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "smartrecruiters.com",
  "workable.com",
  "recruitee.com",
  "bamboohr.com",
  "myworkdayjobs.com",
  "myworkdaysite.com",
  "icims.com",
  "jobvite.com",
  "breezy.hr",
  "applytojob.com",
  "jazzhr.com",
  "paylocity.com",
  "paycomonline.net",
  "rippling.com",
  "rippling-ats.com",
  "teamtailor.com",
  "personio.de",
  "personio.com",
  "join.com",
  "workforcenow.adp.com",
  "adp.com",
  "ultipro.com",
  "successfactors.com",
  "successfactors.eu",
  "oraclecloud.com",
  "taleo.net",
  "wellfound.com",
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ycombinator.com",
]);

export function isJobPlatformDomain(domain: string | null) {
  return Boolean(domain && JOB_PLATFORM_DOMAINS.has(domain));
}

/** Registrable domain of a company website, or null when missing or it points at a job platform. */
export function companyWebsiteDomain(website: string | null | undefined) {
  const domain = website ? toRegistrableDomain(website) : null;
  return domain && !isJobPlatformDomain(domain) ? domain : null;
}

export function publicSuffixOf(domain: string) {
  return getPublicSuffix(domain) ?? "";
}
