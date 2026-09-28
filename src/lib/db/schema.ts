/** Drizzle table types. Mirrors the SQL in src/lib/db/migrations. */
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable(
  "companies",
  {
    atsProvider: text("ats_provider").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("unknown"),
    lastChecked: text("last_checked"),
    lastCrawled: text("last_crawled"),
    website: text("website"),
    usRelevant: integer("us_relevant", { mode: "boolean" }),
    lastJobCount: integer("last_job_count"),
  },
  (table) => [primaryKey({ columns: [table.atsProvider, table.slug] })],
);

export const companySources = sqliteTable(
  "company_sources",
  {
    atsProvider: text("ats_provider").notNull(),
    slug: text("slug").notNull(),
    source: text("source").notNull(),
    firstSeen: text("first_seen").notNull(),
    lastSeen: text("last_seen").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.atsProvider, table.slug, table.source] }),
  ],
);

export const jobs = sqliteTable(
  "jobs",
  {
    atsProvider: text("ats_provider").notNull(),
    boardSlug: text("board_slug").notNull(),
    externalId: text("external_id").notNull(),
    companyName: text("company_name").notNull(),
    title: text("title").notNull(),
    department: text("department"),
    location: text("location"),
    cleanText: text("clean_text").notNull(),
    url: text("url").notNull(),
    isRemote: integer("is_remote", { mode: "boolean" }),
    workplaceType: text("workplace_type"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryUnknown: integer("salary_unknown", { mode: "boolean" }).notNull(),
    postedAt: text("posted_at"),
    updatedAt: text("updated_at"),
    fetchedAt: text("fetched_at").notNull(),
    titleNorm: text("title_norm"),
    locationNorm: text("location_norm"),
    seniority: text("seniority"),
    isUs: integer("is_us", { mode: "boolean" }),
    postedTs: integer("posted_ts"),
    contentHash: text("content_hash"),
    firstSeenAt: text("first_seen_at"),
    closedAt: text("closed_at"),
  },
  (table) => [
    primaryKey({
      columns: [table.atsProvider, table.boardSlug, table.externalId],
    }),
  ],
);

export const jobTracking = sqliteTable(
  "job_tracking",
  {
    atsProvider: text("ats_provider").notNull(),
    boardSlug: text("board_slug").notNull(),
    externalId: text("external_id").notNull(),
    status: text("status").notNull().default("new"),
    note: text("note"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.atsProvider, table.boardSlug, table.externalId],
    }),
  ],
);
