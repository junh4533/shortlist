/** Serper.dev Google search API (2,500 free queries per account). */
import type { SerpProvider } from "./index";

export function createSerper(apiKey: string): SerpProvider {
  return {
    id: "serper",
    async search(query) {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: 10 }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Serper ${response.status}: ${await response.text()}`);
      const data = (await response.json()) as { organic?: { link?: string }[] };
      return (data.organic ?? []).map((result) => result.link ?? "").filter(Boolean);
    },
  };
}
