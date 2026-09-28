/**
 * SQL prefilter for one user's preferences.
 * Invariant: it must never exclude a job that matchJob().ok && isWithinMaxAge() would accept.
 * It only narrows by title include terms, freshness, listed pay, US-only, and open jobs.
 */
import { and, isNull, or, sql, type SQL } from "drizzle-orm";
import type { UserPreferences } from "../config";
import { jobs } from "../db/schema";

const DAY_MS = 86_400_000;

export function buildPrefilter(prefs: UserPreferences, now = Date.now()): SQL {
  const conditions: SQL[] = [isNull(jobs.closedAt)];

  const terms = [...new Set(prefs.titles.include.map((term) => term.toLowerCase()).filter(Boolean))];
  if (!terms.length) return sql`0`;
  conditions.push(
    or(...terms.map((term) => sql`instr(${jobs.titleNorm}, ${term}) > 0`))!,
  );

  const maxAge = prefs.freshness.max_age_days;
  if (maxAge > 0) {
    // One day of slack keeps rows whose age is computed slightly differently at read time.
    const cutoff = now - (maxAge + 1) * DAY_MS;
    conditions.push(
      prefs.freshness.hide_unknown_date
        ? sql`${jobs.postedTs} >= ${cutoff}`
        : sql`(${jobs.postedTs} IS NULL OR ${jobs.postedTs} >= ${cutoff})`,
    );
  }

  const floor = prefs.pay.min_usd + prefs.pay.min_max_buffer_usd;
  const listed = sql`(${jobs.salaryMin} IS NOT NULL OR ${jobs.salaryMax} IS NOT NULL)`;
  const payOk = sql`(coalesce(${jobs.salaryMax}, ${jobs.salaryMin}) > ${floor} AND coalesce(${jobs.salaryMin}, ${jobs.salaryMax}) <= ${prefs.pay.max_usd})`;
  conditions.push(
    prefs.pay.require_listed_salary ? sql`(${listed} AND ${payOk})` : sql`(NOT ${listed} OR ${payOk})`,
  );

  if (prefs.locations.us_only) {
    conditions.push(sql`(${jobs.isUs} IS NULL OR ${jobs.isUs} <> 0)`);
  }

  return and(...conditions)!;
}
