CREATE TABLE IF NOT EXISTS companies (
  ats_provider TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_checked TEXT,
  last_crawled TEXT,
  PRIMARY KEY (ats_provider, slug)
);

CREATE TABLE IF NOT EXISTS jobs (
  ats_provider TEXT NOT NULL,
  board_slug TEXT NOT NULL,
  external_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  department TEXT,
  location TEXT,
  clean_text TEXT NOT NULL,
  url TEXT NOT NULL,
  is_remote INTEGER,
  workplace_type TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_unknown INTEGER NOT NULL,
  posted_at TEXT,
  updated_at TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (ats_provider, board_slug, external_id)
);

CREATE TABLE IF NOT EXISTS job_tracking (
  ats_provider TEXT NOT NULL,
  board_slug TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  note TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ats_provider, board_slug, external_id)
);
