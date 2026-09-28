import { describe, expect, it } from "vitest";
import { extractAtsRefs } from "./patterns";

function refs(text: string) {
  return extractAtsRefs(text).map((ref) => `${ref.atsProvider}:${ref.slug}`);
}

describe("extractAtsRefs", () => {
  it("finds Greenhouse boards, embeds, and API URLs", () => {
    expect(refs("https://boards.greenhouse.io/Acme/jobs/123")).toEqual(["greenhouse:acme"]);
    expect(refs("https://job-boards.greenhouse.io/stripe")).toEqual(["greenhouse:stripe"]);
    expect(refs('<script src="https://boards.greenhouse.io/embed/job_board/js?for=doordashusa"></script>')).toEqual([
      "greenhouse:doordashusa",
    ]);
    expect(refs("https://boards.greenhouse.io/embed/job_board?for=acme&b=https://acme.com")).toEqual([
      "greenhouse:acme",
    ]);
    expect(refs("https://boards-api.greenhouse.io/v1/boards/acme/jobs")).toEqual(["greenhouse:acme"]);
  });

  it("keeps Lever case and allows dotted Lever slugs", () => {
    expect(refs("https://jobs.lever.co/AIFund/3699a783")).toEqual(["lever:AIFund"]);
    expect(refs("apply at https://jobs.lever.co/arcteryx.com.")).toEqual(["lever:arcteryx.com"]);
    expect(refs("https://api.lever.co/v0/postings/palantir?mode=json")).toEqual(["lever:palantir"]);
  });

  it("finds Ashby, SmartRecruiters, Workable, Recruitee, and BambooHR", () => {
    expect(refs("https://jobs.ashbyhq.com/Notion/abc")).toEqual(["ashby:notion"]);
    expect(refs("https://jobs.ashbyhq.com/acme/embed?version=2")).toEqual(["ashby:acme"]);
    expect(refs("https://careers.smartrecruiters.com/AdGateMedia")).toEqual(["smartrecruiters:adgatemedia"]);
    expect(refs("https://apply.workable.com/1000heads/j/E4335D00D8")).toEqual(["workable:1000heads"]);
    expect(refs("https://apply.workable.com/j/E4335D00D8")).toEqual([]);
    expect(refs("https://12build.recruitee.com/o/engineer")).toEqual(["recruitee:12build"]);
    expect(refs("https://acme.bamboohr.com/careers/108")).toEqual(["bamboohr:acme"]);
  });

  it("ignores reserved subdomains and path segments", () => {
    expect(refs("https://www.bamboohr.com/careers")).toEqual([]);
    expect(refs("https://boards.greenhouse.io/embed/job_board")).toEqual([]);
    expect(refs("https://jobs.lever.co/")).toEqual([]);
  });

  it("handles escaped URLs in JSON and HTML", () => {
    expect(refs('{"url":"https:\\/\\/jobs.lever.co\\/acme"}')).toEqual(["lever:acme"]);
    expect(refs("https:&#x2F;&#x2F;jobs.ashbyhq.com&#x2F;acme")).toEqual(["ashby:acme"]);
  });

  it("dedupes repeated references", () => {
    expect(
      refs("https://boards.greenhouse.io/acme https://job-boards.greenhouse.io/acme/jobs/1"),
    ).toEqual(["greenhouse:acme"]);
  });
});
