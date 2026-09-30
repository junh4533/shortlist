CREATE TABLE users (
  email TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  beta_access INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

INSERT INTO user_profiles (user_id, preferences, onboarded, updated_at)
SELECT 'junh4533@gmail.com', preferences, onboarded, updated_at
FROM user_profiles
WHERE user_id = 'local'
  AND NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = 'junh4533@gmail.com');

INSERT INTO job_tracking (user_id, ats_provider, board_slug, external_id, status, note, updated_at)
SELECT 'junh4533@gmail.com', ats_provider, board_slug, external_id, status, note, updated_at
FROM job_tracking AS source
WHERE source.user_id = 'local'
  AND NOT EXISTS (
    SELECT 1 FROM job_tracking AS existing
    WHERE existing.user_id = 'junh4533@gmail.com'
      AND existing.ats_provider = source.ats_provider
      AND existing.board_slug = source.board_slug
      AND existing.external_id = source.external_id
  );

INSERT INTO duplicate_overrides (user_id, job_key_a, job_key_b, verdict, created_at)
SELECT 'junh4533@gmail.com', job_key_a, job_key_b, verdict, created_at
FROM duplicate_overrides AS source
WHERE source.user_id = 'local'
  AND NOT EXISTS (
    SELECT 1 FROM duplicate_overrides AS existing
    WHERE existing.user_id = 'junh4533@gmail.com'
      AND existing.job_key_a = source.job_key_a
      AND existing.job_key_b = source.job_key_b
  );
