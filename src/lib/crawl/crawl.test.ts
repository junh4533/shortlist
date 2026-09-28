import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzePage } from "./careers";
import { toRegistrableDomain } from "./domain";
import { crawlFilterReason } from "./filters";
import { readSeedList, seedListFiles, seedSourceFor } from "./seed-lists";

const fixtures = path.join(import.meta.dirname, "__fixtures__");

async function collect(file: string) {
  const rows = [];
  for await (const row of readSeedList(path.join(fixtures, file))) rows.push(row);
  return rows;
}

describe("seed list parsers", () => {
  it("names sources from filenames", () => {
    const sources = Object.fromEntries(seedListFiles(fixtures).map((f) => [path.basename(f.file), f.source]));
    expect(sources).toMatchObject({
      "tranco_TEST.csv": "tranco",
      "1m.csv": "umbrella",
      "top-1m.csv": "piperic",
      "majestic_million.csv": "majestic",
      "netapi_top1mln.csv": "netapi",
      "cloudflare-radar_top-1000000-domains_20260921.csv": "cloudflare-radar",
    });
    expect(seedSourceFor("cloudflare-radar_top-10000-domains_us_2026.csv")).toBe("cloudflare-radar-us");
  });

  it("reads headerless rank,domain lists", async () => {
    expect(await collect("tranco_TEST.csv")).toEqual([
      { domain: "google.com", rank: 1 },
      { domain: "cloudflare.com", rank: 2 },
      { domain: "facebook.com", rank: 3 },
    ]);
    expect((await collect("1m.csv"))[2]).toEqual({ domain: "api.example.co.uk", rank: 3 });
  });

  it("reads lists with headers and quoted cells", async () => {
    expect(await collect("top-1m.csv")).toEqual([
      { domain: "facebook.com", rank: 1 },
      { domain: "instagram.com", rank: 2 },
    ]);
    expect(await collect("majestic_million.csv")).toEqual([{ domain: "google.com", rank: 1 }]);
    expect(await collect("netapi_top1mln.csv")).toEqual([
      { domain: "google.com", rank: 1 },
      { domain: "microsoft.com", rank: 2 },
    ]);
  });

  it("reads domain-only lists without a rank", async () => {
    expect(await collect("cloudflare-radar_top-1000000-domains_20260921.csv")).toEqual([
      { domain: "0-105.com", rank: null },
      { domain: "0-15.cn", rank: null },
    ]);
  });
});

describe("toRegistrableDomain", () => {
  it("reduces hosts and URLs to eTLD+1", () => {
    expect(toRegistrableDomain("https://www.Acme.com/careers")).toBe("acme.com");
    expect(toRegistrableDomain("careers.acme.co.uk")).toBe("acme.co.uk");
    expect(toRegistrableDomain("acme.com.")).toBe("acme.com");
  });

  it("rejects IPs and garbage", () => {
    expect(toRegistrableDomain("192.168.0.1")).toBeNull();
    expect(toRegistrableDomain("")).toBeNull();
    expect(toRegistrableDomain("localhost")).toBeNull();
  });
});

describe("crawlFilterReason", () => {
  it("keeps generic US-friendly endings", () => {
    expect(crawlFilterReason("acme.com")).toBeNull();
    expect(crawlFilterReason("acme.io")).toBeNull();
    expect(crawlFilterReason("datadoghq.com")).toBeNull();
  });

  it("drops country codes, gov/edu, denylisted and infrastructure hosts", () => {
    expect(crawlFilterReason("acme.co.uk")).toBe("suffix");
    expect(crawlFilterReason("acme.de")).toBe("suffix");
    expect(crawlFilterReason("state.gov")).toBe("suffix");
    expect(crawlFilterReason("mit.edu")).toBe("suffix");
    expect(crawlFilterReason("cloudfront.net")).toBe("denylist");
    expect(crawlFilterReason("acme-cdn.com")).toBe("infrastructure");
  });
});

describe("analyzePage", () => {
  const home = (html: string, links: { href: string; text: string }[] = []) => ({
    html,
    finalUrl: "https://acme.com/",
    links,
  });

  it("returns refs found on the homepage and stops", () => {
    const result = analyzePage(
      "acme.com",
      home('<script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script>'),
      { stage: "home", guessCareersPath: true },
    );
    expect(result).toEqual({ refs: [{ atsProvider: "greenhouse", slug: "acme" }], next: null });
  });

  it("follows a same-domain careers link", () => {
    const result = analyzePage(
      "acme.com",
      home("<a>x</a>", [
        { href: "https://twitter.com/acme", text: "Twitter" },
        { href: "https://careers.acme.com/open-roles#top", text: "Careers" },
      ]),
      { stage: "home", guessCareersPath: true },
    );
    expect(result.next).toBe("https://careers.acme.com/open-roles");
  });

  it("guesses /careers only when allowed", () => {
    expect(analyzePage("acme.com", home(""), { stage: "home", guessCareersPath: true }).next).toBe(
      "https://acme.com/careers",
    );
    expect(analyzePage("acme.com", home(""), { stage: "home", guessCareersPath: false }).next).toBeNull();
  });

  it("detects ATS redirects through the final URL", () => {
    const result = analyzePage(
      "acme.com",
      { html: "", finalUrl: "https://jobs.lever.co/Acme", links: [] },
      { stage: "careers", guessCareersPath: false },
    );
    expect(result.refs).toEqual([{ atsProvider: "lever", slug: "Acme" }]);
  });
});
