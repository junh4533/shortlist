/** SerpApi Google engine (250 free searches per month). */
import type { SerpProvider } from "./index";

export function createSerpApi(apiKey: string): SerpProvider {
  return {
    id: "serpapi",
    async search(query) {
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google");
      url.searchParams.set("q", query);
      url.searchParams.set("num", "10");
      url.searchParams.set("api_key", apiKey);
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`SerpApi ${response.status}: ${await response.text()}`);
      const data = (await response.json()) as { organic_results?: { link?: string }[] };
      return (data.organic_results ?? []).map((result) => result.link ?? "").filter(Boolean);
    },
  };
}
