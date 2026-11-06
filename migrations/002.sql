-- Run once on an existing database (schema.sql already includes these for fresh installs).
ALTER TABLE photos ADD COLUMN pose TEXT;
CREATE TABLE IF NOT EXISTS usda_cache (
  query TEXT PRIMARY KEY,
  food TEXT NOT NULL
);
