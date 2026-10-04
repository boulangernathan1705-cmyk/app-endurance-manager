-- Individual training (module "training", server/training.mjs). A pilot's LMU sessions, sent by the sync program or
-- dropped on the page: only his own laps are kept. Removes the tables of an earlier attempt (dev database only).
DROP TABLE IF EXISTS preparation_sessions;
DROP TABLE IF EXISTS preparation_devices;
DROP TABLE IF EXISTS preparation_profiles;
DROP TABLE IF EXISTS preparation_settings;
CREATE TABLE training_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  track_key TEXT NOT NULL,
  venue TEXT NOT NULL,
  course TEXT NOT NULL,
  car TEXT NOT NULL,
  car_class TEXT NOT NULL,
  kind TEXT NOT NULL,
  laps TEXT NOT NULL,
  best REAL,
  s1 REAL,
  s2 REAL,
  s3 REAL,
  per_lap REAL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id,fingerprint)
);
CREATE INDEX training_sessions_mine ON training_sessions(user_id,track_key,started_at);
CREATE INDEX training_sessions_track ON training_sessions(track_key,car_class,started_at);
CREATE TABLE training_devices (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);
CREATE TABLE training_marks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_key TEXT NOT NULL,
  step TEXT NOT NULL,
  PRIMARY KEY(user_id,track_key,step)
);
