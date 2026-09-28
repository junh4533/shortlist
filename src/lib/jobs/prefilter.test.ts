import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeAll, describe, expect, it } from "vitest";
import { loadDefaultPreferences, type UserPreferences } from "../config";
import * as schema from "../db/schema";
import { jobs } from "../db/schema";
import { matchJob } from "../match";
import { deriveJobFields } from "./derive";
import { buildPrefilter } from "./prefilter";
import { isWithinMaxAge } from "./query";

const root = path.resolve(import.meta.dirname, "../../..");
const client = createClient({ url: ":memory:" });
const db = drizzle(client, { schema });

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const TITLES = [
  "Frontend Engineer",
  "Senior Front-End Developer (React)",
  "Staff Frontend Engineer",
  "Software Developer II",
  "React Native Engineer",
  "Data Scientist",
  "UI Engineer, Design Systems",
  "Junior Web Developer",
  "Engineering Manager, Frontend",
  "Solutions Engineer",
  "TypeScript Developer",
  "Product Designer",
];
const LOCATIONS: (string | null)[] = [
  "Remote",
  "New York, NY",
  "London, United Kingdom",
  "Remote - US",
  "Toronto, Canada",
  "Hybrid - New York City",
  null,
  "San Francisco, CA",
  "Remote (Europe)",
];
const SALARIES: [number | null, number | null][] = [
  [null, null],
  [90000, 120000],
  [150000, 200000],
  [null, 105000],
  [300000, null],
];
const DATES: (string | null)[] = [daysAgo(1), daysAgo(10), daysAgo(25), daysAgo(90), null, "not a date"];
const TEXTS = [
  "We use React, TypeScript, Next.js and Node.js. Tailwind and SQL are a plus.",
  "Python, pandas, and machine learning.",
  "HTML, CSS, JavaScript, React. Must be based in the US.",
  "Join our team. Security clearance required.",
];

type Fixture = typeof jobs.$inferInsert;

function fixtures(): Fixture[] {
  const out: Fixture[] = [];
  let n = 0;
  for (const title of TITLES) {
    for (let i = 0; i < 5; i++) {
      const location = LOCATIONS[(n + i) % LOCATIONS.length];
      const [salaryMin, salaryMax] = SALARIES[(n + 2 * i) % SALARIES.length];
      const postedAt = DATES[(n + 3 * i) % DATES.length];
      const cleanText = TEXTS[(n + i) % TEXTS.length];
      const url = `https://example.com/jobs/${n}`;
      const job = {
        atsProvider: "greenhouse",
        boardSlug: "acme",
        externalId: String(n),
        companyName: "Acme",
        title,
        department: null,
        location,
        cleanText,
        url,
        isRemote: location ? /remote/i.test(location) : null,
        workplaceType: location && /hybrid/i.test(location) ? "hybrid" : null,
        salaryMin,
        salaryMax,
        salaryUnknown: salaryMin == null && salaryMax == null,
        postedAt,
        updatedAt: null,
        fetchedAt: daysAgo(0),
      };
      out.push({ ...job, ...deriveJobFields(job) });
      n += 1;
    }
  }
  return out;
}

const rows = fixtures();

beforeAll(async () => {
  const dir = path.join(root, "src", "lib", "db", "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(path.join(dir, file), "utf8").replace(/\$\{[A-Z_]+\}/g, "local"));
  }
  await db.insert(jobs).values(rows);
});

function variants(): [string, UserPreferences][] {
  const base = loadDefaultPreferences(root);
  return [
    ["default template", base],
    ["listed salary required", { ...base, pay: { ...base.pay, require_listed_salary: true } }],
    ["hide unknown dates", { ...base, freshness: { ...base.freshness, hide_unknown_date: true } }],
    ["no max age", { ...base, freshness: { ...base.freshness, max_age_days: 0 } }],
    ["not US-only", { ...base, locations: { ...base.locations, us_only: false } }],
    [
      "broad titles, no skills",
      {
        ...base,
        titles: { ...base.titles, include: ["engineer", "developer", "designer"], exclude: [] },
        skills: { ...base.skills, required: [], min_preferred_hits: 0 },
        seniority: { ...base.seniority, exclude: [] },
        pay: { ...base.pay, min_usd: 50000, max_usd: 400000 },
      },
    ],
  ];
}

describe("buildPrefilter", () => {
  it("fixtures cover both matching and non-matching jobs", () => {
    const prefs = variants()[5][1];
    const accepted = rows.filter((row) => matchJob(row as never, prefs).ok);
    expect(accepted.length).toBeGreaterThan(5);
    expect(accepted.length).toBeLessThan(rows.length);
  });

  for (const [label, prefs] of variants()) {
    it(`never drops a job matchJob accepts (${label})`, async () => {
      const selected = await db
        .select({ id: jobs.externalId })
        .from(jobs)
        .where(buildPrefilter(prefs));
      const ids = new Set(selected.map((row) => row.id));
      const expected = rows.filter(
        (row) =>
          matchJob(row as never, prefs).ok &&
          isWithinMaxAge(
            row.postedAt ?? null,
            row.updatedAt ?? null,
            prefs.freshness.max_age_days,
            prefs.freshness.hide_unknown_date,
          ),
      );
      for (const row of expected) expect(ids.has(row.externalId)).toBe(true);
      expect(ids.size).toBeLessThanOrEqual(rows.length);
    });
  }

  it("excludes closed jobs", async () => {
    const prefs = variants()[5][1];
    const [closed] = rows;
    await client.execute({
      sql: "UPDATE jobs SET closed_at = ? WHERE external_id = ?",
      args: [daysAgo(0), closed.externalId],
    });
    const selected = await db.select({ id: jobs.externalId }).from(jobs).where(buildPrefilter(prefs));
    expect(selected.some((row) => row.id === closed.externalId)).toBe(false);
  });

  it("matches nothing when no title terms are configured", async () => {
    const base = loadDefaultPreferences(root);
    const prefs = { ...base, titles: { ...base.titles, include: [] } };
    expect(await db.select().from(jobs).where(buildPrefilter(prefs))).toHaveLength(0);
  });
});
