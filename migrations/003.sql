-- Run once on an existing database (schema.sql already includes these for fresh installs).
ALTER TABLE food_log ADD COLUMN meal TEXT;
ALTER TABLE food_log ADD COLUMN fiber REAL;
ALTER TABLE body ADD COLUMN extra TEXT;
