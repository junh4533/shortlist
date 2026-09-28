-- Full-text index over short fields for the search box (external content = jobs, keyed by rowid).
-- jobs has no INTEGER PRIMARY KEY, so VACUUM can renumber rowids: run
-- INSERT INTO jobs_fts(jobs_fts) VALUES('rebuild') after any VACUUM.
CREATE VIRTUAL TABLE jobs_fts USING fts5(
  title,
  company_name,
  location,
  content = 'jobs',
  content_rowid = 'rowid'
);

CREATE TRIGGER jobs_fts_insert AFTER INSERT ON jobs BEGIN
  INSERT INTO jobs_fts (rowid, title, company_name, location)
  VALUES (new.rowid, new.title, new.company_name, new.location);
END;

CREATE TRIGGER jobs_fts_delete AFTER DELETE ON jobs BEGIN
  INSERT INTO jobs_fts (jobs_fts, rowid, title, company_name, location)
  VALUES ('delete', old.rowid, old.title, old.company_name, old.location);
END;

CREATE TRIGGER jobs_fts_update AFTER UPDATE OF title, company_name, location ON jobs BEGIN
  INSERT INTO jobs_fts (jobs_fts, rowid, title, company_name, location)
  VALUES ('delete', old.rowid, old.title, old.company_name, old.location);
  INSERT INTO jobs_fts (rowid, title, company_name, location)
  VALUES (new.rowid, new.title, new.company_name, new.location);
END;

INSERT INTO jobs_fts (jobs_fts) VALUES ('rebuild');
