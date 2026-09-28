CREATE TABLE company_sources (
  ats_provider TEXT NOT NULL,
  slug TEXT NOT NULL,
  source TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (ats_provider, slug, source)
);
CREATE INDEX company_sources_source ON company_sources (source);

ALTER TABLE companies ADD COLUMN website TEXT;
ALTER TABLE companies ADD COLUMN us_relevant INTEGER;
ALTER TABLE companies ADD COLUMN last_job_count INTEGER;
