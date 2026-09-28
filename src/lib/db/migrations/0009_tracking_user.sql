CREATE TABLE job_tracking_v2 (
  user_id TEXT NOT NULL,
  ats_provider TEXT NOT NULL,
  board_slug TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  note TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, ats_provider, board_slug, external_id)
);

INSERT INTO job_tracking_v2 (user_id, ats_provider, board_slug, external_id, status, note, updated_at)
SELECT '${OWNER_USER_ID}', ats_provider, board_slug, external_id, status, note, updated_at
FROM job_tracking;

DROP TABLE job_tracking;
ALTER TABLE job_tracking_v2 RENAME TO job_tracking;
