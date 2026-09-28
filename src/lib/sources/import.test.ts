import { describe, expect, it } from "vitest";
import { ATS_PROVIDERS } from "../ats/providers";
import { resolveRow } from "./import";

const all = new Set(ATS_PROVIDERS);

describe("resolveRow", () => {
  it("prefers the case-preserving slug found in the URL", () => {
    expect(
      resolveRow({ atsProvider: "lever", slug: "aifund", atsUrl: "https://jobs.lever.co/AIFund" }, all),
    ).toMatchObject([{ atsProvider: "lever", slug: "AIFund" }]);
  });

  it("falls back to the explicit slug", () => {
    expect(resolveRow({ atsProvider: "greenhouse", slug: "Stripe" }, all)).toMatchObject([
      { atsProvider: "greenhouse", slug: "Stripe" },
    ]);
  });

  it("ignores URL refs for a different provider than the row says", () => {
    expect(
      resolveRow(
        { atsProvider: "ashby", slug: "acme", atsUrl: "https://boards.greenhouse.io/other" },
        all,
      ),
    ).toMatchObject([{ atsProvider: "ashby", slug: "acme" }]);
  });

  it("extracts every supported ref from free-form links", () => {
    const rows = resolveRow(
      { atsUrl: "https://job-boards.greenhouse.io/bungie https://careers.bungie.com/jobs", name: "Bungie" },
      all,
    );
    expect(rows).toMatchObject([{ atsProvider: "greenhouse", slug: "bungie", name: "Bungie" }]);
  });

  it("drops providers that are not enabled", () => {
    expect(resolveRow({ atsProvider: "workable", slug: "acme" }, new Set(["greenhouse" as const]))).toEqual([]);
  });
});
