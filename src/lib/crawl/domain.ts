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

export function publicSuffixOf(domain: string) {
  return getPublicSuffix(domain) ?? "";
}
