import { describe, expect, it } from "vitest";
import { jobCollapseKey, normalizeJobUrl } from "./url";

describe("normalizeJobUrl", () => {
  it("aliases Greenhouse hosts and strips tracking", () => {
    expect(
      normalizeJobUrl("https://boards.greenhouse.io/acme/jobs/123?gh_src=x&utm_source=y"),
    ).toBe("https://job-boards.greenhouse.io/acme/jobs/123");
  });

  it("preserves path case for case-sensitive boards", () => {
    expect(normalizeJobUrl("https://jobs.lever.co/AIFund/abc/apply")).toBe(
      "https://jobs.lever.co/AIFund/abc",
    );
    expect(normalizeJobUrl("https://apply.workable.com/j/E4335D00D8/apply")).toBe(
      "https://apply.workable.com/j/E4335D00D8",
    );
  });

  it("drops the SmartRecruiters oga param", () => {
    expect(
      normalizeJobUrl("https://jobs.smartrecruiters.com/AdGateMedia/743999796348385-bdm?oga=true"),
    ).toBe("https://jobs.smartrecruiters.com/AdGateMedia/743999796348385-bdm");
  });
});

describe("jobCollapseKey", () => {
  it("uses Greenhouse ids only for Greenhouse URLs", () => {
    expect(
      jobCollapseKey({ url: "https://job-boards.greenhouse.io/acme/jobs/42", atsProvider: "greenhouse", externalId: "42" }),
    ).toBe("greenhouse:42");
    expect(
      jobCollapseKey({ url: "https://acme.com/careers?gh_jid=42", atsProvider: "greenhouse", externalId: "42" }),
    ).toBe("greenhouse:42");
    expect(
      jobCollapseKey({ url: "https://example.recruitee.com/jobs/42", atsProvider: "recruitee", externalId: "999" }),
    ).toBe("recruitee:999");
  });

  it("builds keys for the new providers", () => {
    expect(
      jobCollapseKey({ url: "https://apply.workable.com/j/E4335D00D8", atsProvider: "workable", externalId: "E4335D00D8" }),
    ).toBe("workable:e4335d00d8");
    expect(
      jobCollapseKey({
        url: "https://jobs.smartrecruiters.com/AdGateMedia/743999796348385-bdm",
        atsProvider: "smartrecruiters",
        externalId: "743999796348385",
      }),
    ).toBe("smartrecruiters:743999796348385");
  });

  it("keeps BambooHR ids scoped to the company subdomain", () => {
    const a = jobCollapseKey({ url: "https://acme.bamboohr.com/careers/108", atsProvider: "bamboohr", externalId: "108" });
    const b = jobCollapseKey({ url: "https://other.bamboohr.com/careers/108", atsProvider: "bamboohr", externalId: "108" });
    expect(a).not.toBe(b);
  });
});
