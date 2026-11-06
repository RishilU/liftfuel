CREATE TABLE IF NOT EXISTS sets (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  weight REAL NOT NULL,
  reps INTEGER NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS sets_date ON sets(date);
CREATE INDEX IF NOT EXISTS sets_ex ON sets(exercise_id, date);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS food_log (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  grams REAL,
  kcal REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  meal TEXT,
  fiber REAL,
  micro TEXT
);
CREATE INDEX IF NOT EXISTS food_date ON food_log(date);
CREATE TABLE IF NOT EXISTS body (
  date TEXT PRIMARY KEY,
  weight REAL,
  waist REAL,
  extra TEXT
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  data TEXT NOT NULL,
  pose TEXT
);
CREATE TABLE IF NOT EXISTS usda_cache (
  query TEXT PRIMARY KEY,
  food TEXT NOT NULL
);
