import { describe, expect, it } from "vitest";
import { refsFromCdxLines } from "./cc-cdx";
import { commentText, companyFromComment } from "./hn";
import { slugCandidates } from "./probe";

describe("refsFromCdxLines", () => {
  it("keeps 200 rows for the query's provider only", () => {
    const body = [
      JSON.stringify({ url: "https://acme.recruitee.com/o/engineer", status: "200" }),
      JSON.stringify({ url: "https://beta.recruitee.com/", status: "404" }),
      JSON.stringify({ url: "https://www.recruitee.com/pricing", status: "200" }),
      "not json",
      "",
    ].join("\n");
    expect(refsFromCdxLines(body, "recruitee")).toEqual([{ atsProvider: "recruitee", slug: "acme" }]);
  });
});

describe("HN comment parsing", () => {
  it("reads the company from the first pipe-separated segment", () => {
    expect(companyFromComment("Acme Corp | Senior Engineer | NYC | Onsite\nWe build...")).toBe("Acme Corp");
    expect(companyFromComment("https://acme.com is hiring")).toBeUndefined();
  });

  it("keeps hrefs whose visible text was shortened", () => {
    const text = commentText(
      'Acme | Engineer<p>Apply: <a href="https:&#x2F;&#x2F;jobs.ashbyhq.com&#x2F;acme">jobs.ashbyhq.com&#x2F;a...</a>',
    );
    expect(text).toContain("https://jobs.ashbyhq.com/acme");
    expect(text.split("\n")[0]).toBe("Acme | Engineer");
  });
});

describe("slugCandidates", () => {
  it("builds joined, hyphenated, and domain-label guesses", () => {
    expect(slugCandidates("Acme Robotics, Inc.", "https://www.acmerobots.com")).toEqual([
      "acmerobotics",
      "acme-robotics",
      "acmerobots",
    ]);
  });

  it("dedupes and tolerates missing or malformed input", () => {
    expect(slugCandidates("Gusto", "gusto.com")).toEqual(["gusto"]);
    expect(slugCandidates(undefined, "not a url")).toEqual([]);
  });
});
