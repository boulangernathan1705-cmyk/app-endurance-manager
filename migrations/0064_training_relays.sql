-- The relay plan of each crew (server/training-prep.mjs): how many relays the crew plans, and who drives each one.
-- The setup files of the preparation are dropped, and the hourly plan that only lived on the dev site.
DROP TABLE IF EXISTS training_prep_setups;
DROP TABLE IF EXISTS training_stints;
CREATE TABLE training_relay_counts (
  crew_id TEXT PRIMARY KEY REFERENCES crews(id) ON DELETE CASCADE,
  count INTEGER NOT NULL CHECK(count BETWEEN 1 AND 60),
  updated_at INTEGER NOT NULL
);
CREATE TABLE training_relays (
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  relay INTEGER NOT NULL,
  registration_id TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(crew_id, relay)
);
