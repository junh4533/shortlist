import { describe, expect, it } from "vitest";
import { makeTitleAllowlist } from "./store-filter";

describe("makeTitleAllowlist", () => {
  const allowed = makeTitleAllowlist(["engineer", "full stack", "it"]);

  it("matches whole words case-insensitively", () => {
    expect(allowed("Senior Software Engineer")).toBe(true);
    expect(allowed("Full Stack Developer")).toBe(true);
    expect(allowed("IT Support Specialist")).toBe(true);
  });

  it("does not match inside other words", () => {
    expect(allowed("Engineering Manager")).toBe(false);
    expect(allowed("Recruiter, Kitchen")).toBe(false);
  });

  it("allows everything when the list is empty", () => {
    expect(makeTitleAllowlist([])("Chef")).toBe(true);
  });
});
