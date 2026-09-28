CREATE TABLE serp_queries (
  query TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  run_at TEXT NOT NULL,
  results INTEGER NOT NULL DEFAULT 0,
  new_slugs INTEGER NOT NULL DEFAULT 0
);
