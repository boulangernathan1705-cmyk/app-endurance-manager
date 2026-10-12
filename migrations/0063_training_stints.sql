-- The relay plan of each crew (server/training-prep.mjs): who drives each hour of the race. The setup files of the
-- preparation are dropped: the crews share their setups elsewhere.
DROP TABLE IF EXISTS training_prep_setups;
CREATE TABLE training_stints (
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  hour INTEGER NOT NULL,
  registration_id TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(crew_id, hour)
);
