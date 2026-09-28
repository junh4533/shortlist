import { describe, expect, it } from "vitest";
import { normalizeSlug } from "./slug";

describe("normalizeSlug", () => {
  it("trims and lowercases case-insensitive providers", () => {
    expect(normalizeSlug("greenhouse", " Acme ")).toBe("acme");
    expect(normalizeSlug("ashby", "AeroVect")).toBe("aerovect");
  });

  it("preserves case for Lever", () => {
    expect(normalizeSlug("lever", " AIFund ")).toBe("AIFund");
  });

  it("decodes percent-encoding", () => {
    expect(normalizeSlug("greenhouse", "acme%2Dco")).toBe("acme-co");
  });

  it("strips slashes, query, and hash", () => {
    expect(normalizeSlug("ashby", "Acme/")).toBe("acme");
    expect(normalizeSlug("ashby", "/acme?utm=x#top")).toBe("acme");
  });

  it("rejects reserved path segments", () => {
    expect(normalizeSlug("greenhouse", "jobs")).toBeNull();
    expect(normalizeSlug("greenhouse", "Embed")).toBeNull();
    expect(normalizeSlug("lever", "Jobs")).toBeNull();
  });

  it("allows dots only where the provider does", () => {
    expect(normalizeSlug("lever", "arcteryx.com")).toBe("arcteryx.com");
    expect(normalizeSlug("ashby", "candidate.fyi")).toBe("candidate.fyi");
    expect(normalizeSlug("greenhouse", "a.b")).toBeNull();
    expect(normalizeSlug("recruitee", "a.b")).toBeNull();
    expect(normalizeSlug("lever", "a..b")).toBeNull();
  });

  it("rejects whitespace and inner slashes", () => {
    expect(normalizeSlug("greenhouse", "a b")).toBeNull();
    expect(normalizeSlug("greenhouse", "acme/jobs")).toBeNull();
    expect(normalizeSlug("greenhouse", "   ")).toBeNull();
  });

  it("returns null for malformed encoding", () => {
    expect(normalizeSlug("lever", "%E0%A4%A")).toBeNull();
  });
});
