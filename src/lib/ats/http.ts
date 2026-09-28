/** GET JSON from a public ATS endpoint with a timeout, 429 back-off, and dead/error classification. */
import { sleep } from "../concurrency";

const DEFAULT_TIMEOUT_MS = 20_000;

export type JsonResponse =
  | { kind: "ok"; status: number; data: unknown }
  /** 404, redirect off the provider, or a non-JSON body: the board does not exist. */
  | { kind: "dead"; status: number }
  /** 5xx, timeout, or rate limit that never cleared: try again next run. */
  | { kind: "error"; status?: number };

export async function getJson(
  url: string,
  userAgent: string,
  options: { retryOn5xx?: boolean; followRedirects?: boolean } = {},
  attempt = 0,
): Promise<JsonResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": userAgent },
      redirect: options.followRedirects === false ? "manual" : "follow",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch {
    return { kind: "error" };
  }

  if (response.status === 429 && attempt < 4) {
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
    return getJson(url, userAgent, options, attempt + 1);
  }
  if (response.status >= 500 && options.retryOn5xx && attempt < 2) {
    await sleep(2000 * (attempt + 1));
    return getJson(url, userAgent, options, attempt + 1);
  }
  if (response.status === 404 || (response.status >= 300 && response.status < 400)) {
    return { kind: "dead", status: response.status };
  }
  if (!response.ok) return { kind: "error", status: response.status };

  try {
    return { kind: "ok", status: response.status, data: await response.json() };
  } catch {
    return { kind: "dead", status: response.status };
  }
}
