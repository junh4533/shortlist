CREATE TABLE seed_domains (
  domain TEXT PRIMARY KEY,
  best_rank INTEGER,
  list_count INTEGER NOT NULL DEFAULT 0,
  sources TEXT NOT NULL DEFAULT '',
  tier INTEGER,
  dns_ok INTEGER,
  crawled_at TEXT,
  result TEXT
);
CREATE INDEX seed_domains_queue ON seed_domains (tier, crawled_at, best_rank);
