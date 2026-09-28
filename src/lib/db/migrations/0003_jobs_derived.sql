ALTER TABLE jobs ADD COLUMN title_norm TEXT;
ALTER TABLE jobs ADD COLUMN location_norm TEXT;
ALTER TABLE jobs ADD COLUMN seniority TEXT;
ALTER TABLE jobs ADD COLUMN is_us INTEGER;
ALTER TABLE jobs ADD COLUMN posted_ts INTEGER;
ALTER TABLE jobs ADD COLUMN content_hash TEXT;
ALTER TABLE jobs ADD COLUMN first_seen_at TEXT;
ALTER TABLE jobs ADD COLUMN closed_at TEXT;

CREATE INDEX jobs_open_posted ON jobs (closed_at, posted_ts);
CREATE INDEX jobs_is_us ON jobs (is_us);
CREATE INDEX jobs_salary_max ON jobs (salary_max);
CREATE INDEX jobs_board ON jobs (ats_provider, board_slug);
CREATE INDEX jobs_url ON jobs (url);
