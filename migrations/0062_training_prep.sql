-- The preparation of each race (server/training-prep.mjs): the pilot's status per step, the notes and the setup
-- shared with the crew, and the lap a pilot types when the game is not linked.
CREATE TABLE training_prep (
  event_id TEXT NOT NULL,
  departure_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('done','rework','todo','skip')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(event_id, departure_id, user_id, step)
);
CREATE TABLE training_prep_notes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  departure_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  step TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX training_prep_notes_race ON training_prep_notes(event_id, departure_id);
CREATE TABLE training_prep_setups (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  departure_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX training_prep_setups_race ON training_prep_setups(event_id, departure_id);
CREATE TABLE training_manual (
  user_id TEXT NOT NULL,
  circuit TEXT NOT NULL,
  car_class TEXT NOT NULL,
  best REAL,
  fuel REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, circuit, car_class)
);
