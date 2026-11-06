-- Run once on an existing database (schema.sql already includes this for fresh installs).
ALTER TABLE food_log ADD COLUMN micro TEXT;
