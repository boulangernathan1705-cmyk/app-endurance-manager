-- Individual training, live data (server/training.mjs): what the sync program reads from LMU while the pilot drives
-- (tyre wear and temperatures, compound, top speed, fuel in litres, pit stops broken down). Only the pilot sees it.
CREATE TABLE training_live (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  circuit TEXT NOT NULL,
  track TEXT NOT NULL,
  car TEXT NOT NULL,
  car_class TEXT NOT NULL,
  capacity REAL,
  laps TEXT NOT NULL,
  stops TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id,fingerprint)
);
CREATE INDEX training_live_mine ON training_live(user_id,circuit,car_class,started_at);
-- The pilot's name in LMU: online, every driver of a results file is marked as the player, so his laps are found by
-- name. Learnt from the live data, or typed on the page. Files that arrive before it is known wait here (without
-- their <Stream> section) and are read as soon as it is.
CREATE TABLE training_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lmu_name TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE training_pending (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  xml TEXT NOT NULL,
  drivers TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX training_pending_mine ON training_pending(user_id,created_at);
