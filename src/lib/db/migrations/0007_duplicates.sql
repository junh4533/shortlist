ALTER TABLE companies ADD COLUMN company_key TEXT;
ALTER TABLE companies ADD COLUMN company_key_confidence TEXT;
CREATE INDEX companies_company_key ON companies (company_key);

ALTER TABLE jobs ADD COLUMN dup_group_id TEXT;
ALTER TABLE jobs ADD COLUMN dup_confidence TEXT;
ALTER TABLE jobs ADD COLUMN dup_reason TEXT;
CREATE INDEX jobs_dup_group ON jobs (dup_group_id);

CREATE TABLE duplicate_overrides (
  user_id TEXT NOT NULL,
  job_key_a TEXT NOT NULL,
  job_key_b TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('same', 'different')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, job_key_a, job_key_b)
);
