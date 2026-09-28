import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapAshby } from "./ashby";
import { mapBambooJob } from "./bamboohr";
import { mapGreenhouse } from "./greenhouse";
import { mapLever } from "./lever";
import { mapRecruitee } from "./recruitee";
import { mapSmartRecruitersPosting } from "./smartrecruiters";
import type { FetchedJob } from "./types";
import { mapWorkable } from "./workable";

function fixture(name: string) {
  return JSON.parse(
    readFileSync(path.join(import.meta.dirname, "__fixtures__", `${name}.json`), "utf8"),
  );
}

function expectWellFormed(jobs: FetchedJob[] | null) {
  expect(jobs).not.toBeNull();
  expect(jobs!.length).toBeGreaterThan(0);
  for (const job of jobs!) {
    expect(job.externalId).toBeTruthy();
    expect(job.title).toBeTruthy();
    expect(job.url).toMatch(/^https:\/\//);
    expect(typeof job.salaryUnknown).toBe("boolean");
    if (job.postedAt) expect(Number.isNaN(Date.parse(job.postedAt))).toBe(false);
  }
}

describe("existing adapters", () => {
  it("maps Greenhouse", () => {
    const jobs = mapGreenhouse(fixture("greenhouse"));
    expectWellFormed(jobs);
    expect(jobs![0].url).toContain("airbnb");
  });

  it("maps Lever", () => {
    const jobs = mapLever(fixture("lever"));
    expectWellFormed(jobs);
    expect(jobs![0].url).toContain("jobs.lever.co/palantir");
  });

  it("maps Ashby", () => {
    expectWellFormed(mapAshby(fixture("ashby")));
  });

  it("rejects payloads of the wrong shape", () => {
    expect(mapGreenhouse({})).toBeNull();
    expect(mapLever({ jobs: [] })).toBeNull();
    expect(mapAshby([])).toBeNull();
  });
});

describe("SmartRecruiters", () => {
  const list = fixture("smartrecruiters-list");
  const detail = fixture("smartrecruiters-detail");

  it("maps a posting without details", () => {
    const job = mapSmartRecruitersPosting("AdGateMedia", list.content[0]);
    expect(job).not.toBeNull();
    expect(job!.title).toBe("Business Development Manager, Mobile");
    expect(job!.location).toBe("Manhasset, NY, United States");
    expect(job!.isRemote).toBe(true);
    expect(job!.url).toBe("https://jobs.smartrecruiters.com/AdGateMedia/743999796348385");
    expect(job!.postedAt).toBe("2022-01-04T17:33:39.000Z");
  });

  it("uses the detail posting URL and description", () => {
    const job = mapSmartRecruitersPosting("AdGateMedia", list.content[0], detail);
    expect(job!.url).toContain("743999796348385-business-development-manager-mobile");
    expect(job!.cleanText).toContain("Business Development Manager");
  });
});

describe("Workable", () => {
  it("maps jobs with locations and descriptions", () => {
    const jobs = mapWorkable(fixture("workable"));
    expectWellFormed(jobs);
    const first = jobs![0];
    expect(first.externalId).toBe("E4335D00D8");
    expect(first.location).toBe("New York, New York, United States");
    expect(first.url).toBe("https://apply.workable.com/j/E4335D00D8");
    expect(first.cleanText.length).toBeGreaterThan(20);
  });
});

describe("Recruitee", () => {
  it("maps published offers", () => {
    const jobs = mapRecruitee(fixture("recruitee"));
    expectWellFormed(jobs);
    expect(jobs![0].url).toContain("12build.recruitee.com/o/");
    expect(jobs![0].workplaceType).toBe("hybrid");
  });

  it("appends United States when only the country code says so", () => {
    const jobs = mapRecruitee({
      offers: [
        {
          id: 1,
          title: "Engineer",
          careers_url: "https://acme.recruitee.com/o/engineer",
          location: "Austin, Texas",
          country_code: "US",
          status: "published",
        },
      ],
    });
    expect(jobs![0].location).toBe("Austin, Texas, United States");
  });
});

describe("BambooHR", () => {
  const list = fixture("bamboohr-list");
  const detail = fixture("bamboohr-detail");

  it("maps list entries to subdomain URLs", () => {
    const job = mapBambooJob("100percentgroup", list.result[1]);
    expect(job!.url).toBe("https://100percentgroup.bamboohr.com/careers/108");
    expect(job!.workplaceType).toBe("hybrid");
    expect(job!.postedAt).toBeNull();
  });

  it("adds description, country, and date from the detail call", () => {
    const job = mapBambooJob("100percentgroup", list.result[1], detail);
    expect(job!.location).toContain("United Kingdom");
    expect(job!.postedAt).toBe("2026-08-12T00:00:00.000Z");
    expect(job!.cleanText.length).toBeGreaterThan(50);
  });
});
