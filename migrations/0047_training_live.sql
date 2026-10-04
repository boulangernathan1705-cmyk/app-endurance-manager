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
