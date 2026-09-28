import { describe, expect, it } from "vitest";
import { deriveJobFields, postedTimestamp, seniorityOf, usSignal } from "./derive";

describe("usSignal", () => {
  it("flags explicit non-US locations as false", () => {
    expect(usSignal("London, United Kingdom")).toBe(false);
    expect(usSignal("Remote - US or Canada")).toBe(false);
  });

  it("detects US locations", () => {
    expect(usSignal("New York, NY")).toBe(true);
    expect(usSignal("Remote (US)")).toBe(true);
    expect(usSignal("Austin, Texas, United States")).toBe(true);
  });

  it("returns null when unknown", () => {
    expect(usSignal("Remote")).toBeNull();
    expect(usSignal(null)).toBeNull();
  });
});

describe("seniorityOf", () => {
  it("picks the most specific level", () => {
    expect(seniorityOf("Staff Software Engineer")).toBe("staff");
    expect(seniorityOf("Sr. Frontend Engineer")).toBe("senior");
    expect(seniorityOf("Software Engineer")).toBeNull();
  });
});

describe("deriveJobFields", () => {
  const job = {
    title: "Frontend Engineer",
    location: "New York, NY",
    cleanText: "React",
    url: "https://x.test/1",
    salaryMin: null,
    salaryMax: null,
    postedAt: "2026-09-01T00:00:00Z",
    updatedAt: null,
  };

  it("hashes content so unchanged jobs compare equal", () => {
    expect(deriveJobFields(job).contentHash).toBe(deriveJobFields({ ...job }).contentHash);
    expect(deriveJobFields(job).contentHash).not.toBe(
      deriveJobFields({ ...job, salaryMax: 150000 }).contentHash,
    );
  });

  it("stores the lowercase title and parsed timestamp", () => {
    const derived = deriveJobFields(job);
    expect(derived.titleNorm).toBe("frontend engineer");
    expect(derived.postedTs).toBe(Date.parse("2026-09-01T00:00:00Z"));
    expect(postedTimestamp("soon", null)).toBeNull();
  });
});
