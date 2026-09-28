import { describe, expect, it } from "vitest";
import { groupListedJobs, type ListedJob } from "./query";

function row(key: string, overrides: Partial<ListedJob> = {}): ListedJob {
  const [atsProvider, boardSlug, externalId] = key.split("|");
  return {
    jobKey: key,
    atsProvider,
    boardSlug,
    externalId,
    dupGroupId: null,
    dupConfidence: null,
    dupReason: null,
    companyName: "Acme",
    title: "Frontend Engineer",
    location: "New York, NY",
    url: `https://x.test/${externalId}`,
    salaryMin: null,
    salaryMax: null,
    salaryUnknown: true,
    isRemote: false,
    postedAt: null,
    updatedAt: null,
    skillsMatched: [],
    rankScore: 50,
    status: "new",
    ...overrides,
  };
}

const grouped = { dupGroupId: "g1", dupConfidence: "high" as const, dupReason: "Same company domain (acme.com)" };
const a = row("greenhouse|acme|1", { ...grouped, rankScore: 60 });
const b = row("ashby|acme|x", grouped);
const c = row("lever|other|9");

describe("groupListedJobs", () => {
  it("keeps every row and groups by stored duplicate group", () => {
    const groups = groupListedJobs([a, b, c], [], true);
    expect(groups).toHaveLength(2);
    const group = groups.find((g) => g.members.length)!;
    expect(group.primary.jobKey).toBe(a.jobKey);
    expect(group.members.map((m) => m.jobKey)).toEqual([b.jobKey]);
    expect(group.confidence).toBe("high");
    expect(groups.flatMap((g) => [g.primary, ...g.members])).toHaveLength(3);
  });

  it("returns one row per group in flat mode", () => {
    expect(groupListedJobs([a, b, c], [], false).every((g) => g.members.length === 0)).toBe(true);
  });

  it("'different' detaches the second job from the group", () => {
    const groups = groupListedJobs([a, b, c], [{ jobKeyA: a.jobKey, jobKeyB: b.jobKey, verdict: "different" }], true);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.members.length === 0)).toBe(true);
  });

  it("'same' merges two rows and marks the group as manual", () => {
    const groups = groupListedJobs([a, b, c], [{ jobKeyA: a.jobKey, jobKeyB: c.jobKey, verdict: "same" }], true);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
    expect(groups[0].confidence).toBe("manual");
  });

  it("prefers the row with the most advanced status as the primary", () => {
    const groups = groupListedJobs([a, { ...b, status: "applied" }], [], true);
    expect(groups[0].primary.jobKey).toBe(b.jobKey);
  });
});
