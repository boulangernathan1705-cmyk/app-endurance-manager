-- Crew preparation (module "preparation", off by default): the crew's common setup, and each pilot's own checklist
-- with his lap time and consumption, typed by the pilot. Removes the tables of an earlier attempt (dev only).
DROP TABLE IF EXISTS preparation_sessions;
DROP TABLE IF EXISTS preparation_devices;
DROP TABLE IF EXISTS preparation_profiles;
DROP TABLE IF EXISTS preparation_settings;
CREATE TABLE crew_setups (
  crew_id TEXT PRIMARY KEY REFERENCES crews(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bytes BLOB NOT NULL,
  car TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE crew_preparation (
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  checks TEXT NOT NULL DEFAULT '[]',
  lap_ms INTEGER,
  fuel REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(crew_id,registration_id)
);
