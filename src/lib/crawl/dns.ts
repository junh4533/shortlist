/** Cheap DNS pre-check so dead domains never reach the HTTP crawler. */
import { Resolver } from "node:dns/promises";

const DEAD_CODES = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN", "ESERVFAIL", "EREFUSED"]);

/** true = resolves, false = definitely gone, null = timeout/unknown (try again later). */
export async function domainResolves(resolver: Resolver, domain: string): Promise<boolean | null> {
  try {
    const v4 = await resolver.resolve4(domain);
    if (v4.length) return true;
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (!DEAD_CODES.has(code)) return null;
  }
  try {
    const v6 = await resolver.resolve6(domain);
    return v6.length > 0;
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    return DEAD_CODES.has(code) ? false : null;
  }
}

export function createResolver(timeoutMs = 3000) {
  return new Resolver({ timeout: timeoutMs, tries: 1 });
}
