import { describe, expect, it } from "vitest";
import { generateSerpQueries, runSerpHarvest, SERP_HOSTS, type SerpProvider } from "./index";

function mockProvider(links: Record<string, string[]> = {}) {
  const calls: string[] = [];
  const provider: SerpProvider = {
    id: "serper",
    async search(query) {
      calls.push(query);
      return links[query] ?? [`https://jobs.lever.co/acme-${calls.length}/123`];
    },
  };
  return { provider, calls };
}

describe("generateSerpQueries", () => {
  it("round-robins hosts so a small cap still covers each ATS", () => {
    const queries = generateSerpQueries(new Date("2026-09-28"));
    const firstRound = queries.slice(0, SERP_HOSTS.length);
    expect(new Set(firstRound.map((query) => query.split(" ")[0])).size).toBe(SERP_HOSTS.length);
    expect(queries).toContain('site:jobs.ashbyhq.com "YC Summer 2026"');
    expect(new Set(queries).size).toBe(queries.length);
  });
});

describe("runSerpHarvest", () => {
  it("never exceeds the query cap", async () => {
    const { provider, calls } = mockProvider();
    const result = await runSerpHarvest({
      provider,
      queries: ["a", "b", "c", "d", "e"],
      maxQueries: 3,
      ranRecently: () => false,
      record: async () => {},
    });
    expect(calls).toHaveLength(3);
    expect(result.queriesRun).toBe(3);
    expect(result.refs).toHaveLength(3);
  });

  it("skips queries run recently without counting them against the cap", async () => {
    const { provider, calls } = mockProvider();
    const result = await runSerpHarvest({
      provider,
      queries: ["a", "b", "c", "d"],
      maxQueries: 2,
      ranRecently: (query) => query === "a" || query === "b",
      record: async () => {},
    });
    expect(calls).toEqual(["c", "d"]);
    expect(result.skippedRecent).toBe(2);
  });

  it("records each query's results and stops on quota errors", async () => {
    const recorded: string[] = [];
    const provider: SerpProvider = {
      id: "serpapi",
      async search(query) {
        if (query === "b") throw new Error("SerpApi 429: rate limited");
        return ["https://boards.greenhouse.io/stripe"];
      },
    };
    const result = await runSerpHarvest({
      provider,
      queries: ["a", "b", "c"],
      maxQueries: 10,
      ranRecently: () => false,
      record: async (query) => {
        recorded.push(query);
      },
    });
    expect(recorded).toEqual(["a"]);
    expect(result.errors).toHaveLength(1);
    expect(result.queriesRun).toBe(2);
  });

  it("rejects a missing or zero cap", async () => {
    const { provider } = mockProvider();
    await expect(
      runSerpHarvest({ provider, queries: ["a"], maxQueries: 0, ranRecently: () => false, record: async () => {} }),
    ).rejects.toThrow();
  });
});
