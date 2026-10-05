-- Collective memo cycles are independent of personal telemetry and remain available
-- when raw sessions expire. Fresh contributions never rewrite a frozen publication.
CREATE TABLE training_memo_cycles (
  circuit TEXT NOT NULL,
  car TEXT NOT NULL,
  track TEXT NOT NULL,
  car_class TEXT NOT NULL,
  generation TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  renew_at INTEGER NOT NULL,
  frozen_at INTEGER,
  published_at INTEGER,
  snapshot_at INTEGER,
  snapshot TEXT CHECK(snapshot IS NULL OR json_valid(snapshot)),
  reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(circuit,car)
);
CREATE TABLE training_memo_contributions (
  session_id TEXT PRIMARY KEY,
  circuit TEXT NOT NULL,
  car TEXT NOT NULL,
  generation TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  laps INTEGER NOT NULL,
  sample TEXT NOT NULL CHECK(json_valid(sample))
);
CREATE INDEX training_memo_cycle_samples ON training_memo_contributions(circuit,car,generation,user_id);
