import { describe, expect, it } from "vitest";
import {
  cityOf,
  companyIdentity,
  companyKey,
  groupJobs,
  locationCompatible,
  normalizeCompanyName,
  titleKey,
  type GroupableJob,
} from "./duplicates";

describe("companyKey", () => {
  it("prefers the website domain (strong)", () => {
    expect(companyKey({ name: "Acme", slug: "acme", website: "https://www.acme.com/about" })).toEqual({
      key: "d:acme.com",
      confidence: "strong",
    });
  });

  it("uses the normalized real name (medium)", () => {
    expect(companyKey({ name: "Acme Robotics, Inc.", slug: "acmerobotics", website: null })).toEqual({
      key: "n:acmerobotics",
      confidence: "medium",
    });
  });

  it("falls back to the slug without suffixes (weak)", () => {
    expect(companyKey({ name: "acme-inc", slug: "acme-inc", website: null })).toEqual({
      key: "n:acme",
      confidence: "weak",
    });
    expect(companyKey({ name: "acmehq", slug: "acmehq", website: null }).key).toBe("n:acme");
  });

  it("ignores websites that point at a job platform", () => {
    expect(companyKey({ name: "acme", slug: "acme", website: "https://boards.greenhouse.io/acme" }).key).toBe("n:acme");
  });

  it("strips trailing corporate suffixes only", () => {
    expect(normalizeCompanyName("Labs Group Holdings")).toBe("labs");
    expect(normalizeCompanyName("Scale AI")).toBe("scaleai");
  });
});

describe("titleKey", () => {
  it("drops punctuation and work-mode suffixes but keeps seniority", () => {
    expect(titleKey("Senior Frontend Engineer (Remote)")).toBe("senior frontend engineer");
    expect(titleKey("Senior Frontend Engineer - Remote, US")).toBe("senior frontend engineer");
    expect(titleKey("Staff Frontend Engineer")).not.toBe(titleKey("Senior Frontend Engineer"));
    expect(titleKey("Product Designer (Trading)")).not.toBe(titleKey("Product Designer (Chart)"));
    expect(titleKey("Product Designer (NYC, Hybrid)")).toBe("product designer");
  });
});

describe("locationCompatible", () => {
  const at = (location: string | null, isRemote: boolean | null = null) => ({ location, isRemote, workplaceType: null });

  it("treats two remote jobs as compatible", () => {
    expect(locationCompatible(at("Remote - US"), at(null, true))).toBe(true);
  });

  it("compares the first city segment with aliases", () => {
    expect(cityOf("NYC")).toBe("new york");
    expect(locationCompatible(at("New York, NY"), at("NYC"))).toBe(true);
    expect(locationCompatible(at("New York, NY"), at("Austin, TX"))).toBe(false);
  });
});

function job(overrides: Partial<GroupableJob> & { key: string }): GroupableJob {
  return {
    atsProvider: "greenhouse",
    boardSlug: "acme",
    title: "Senior Frontend Engineer",
    location: "New York, NY",
    isRemote: false,
    workplaceType: null,
    company: companyIdentity({ name: "Acme", slug: "acme", website: "acme.com" }),
    ...overrides,
  };
}

describe("groupJobs", () => {
  it("groups the same role across providers with high confidence when domains match", () => {
    const groups = groupJobs([
      job({ key: "a" }),
      job({ key: "b", atsProvider: "ashby", boardSlug: "acme" }),
      job({ key: "c", atsProvider: "ashby", boardSlug: "acme", title: "Product Designer" }),
    ]);
    expect(groups.get("a")?.groupId).toBe(groups.get("b")?.groupId);
    expect(groups.get("a")?.confidence).toBe("high");
    expect(groups.get("a")?.reason).toContain("acme.com");
    expect(groups.has("c")).toBe(false);
  });

  it("never groups Senior with Staff", () => {
    const groups = groupJobs([
      job({ key: "a" }),
      job({ key: "b", atsProvider: "lever", title: "Staff Frontend Engineer" }),
    ]);
    expect(groups.size).toBe(0);
  });

  it("marks the same title in different cities as low", () => {
    const groups = groupJobs([job({ key: "a" }), job({ key: "b", atsProvider: "lever", location: "Austin, TX" })]);
    expect(groups.get("a")?.confidence).toBe("low");
  });

  it("does not group same-board twins (handled elsewhere) or different domains", () => {
    expect(groupJobs([job({ key: "a" }), job({ key: "b" })]).size).toBe(0);
    const other = companyIdentity({ name: "Acme", slug: "acme", website: "acme.io" });
    expect(groupJobs([job({ key: "a" }), job({ key: "b", atsProvider: "lever", company: other })]).size).toBe(0);
  });

  it("uses medium for real names and low for slug-only matches", () => {
    const named = companyIdentity({ name: "Acme Inc", slug: "acme", website: null });
    const slugOnly = companyIdentity({ name: "acmehq", slug: "acmehq", website: null });
    const medium = groupJobs([
      job({ key: "a", company: named }),
      job({ key: "b", atsProvider: "lever", company: companyIdentity({ name: "Acme", slug: "acmeco", website: null }) }),
    ]);
    expect(medium.get("a")?.confidence).toBe("medium");
    const low = groupJobs([job({ key: "a", company: named }), job({ key: "b", atsProvider: "lever", boardSlug: "acmehq", company: slugOnly })]);
    expect(low.get("a")?.confidence).toBe("low");
  });

  it("reports the weakest link for groups of three", () => {
    const groups = groupJobs([
      job({ key: "a" }),
      job({ key: "b", atsProvider: "ashby" }),
      job({ key: "c", atsProvider: "lever", location: "Austin, TX" }),
    ]);
    expect(new Set([...groups.values()].map((g) => g.groupId)).size).toBe(1);
    expect(groups.get("a")?.confidence).toBe("low");
  });
});
