CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY,
  preferences TEXT NOT NULL,
  onboarded INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
