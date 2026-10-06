-- Page history is metadata only. The shared memo reads one compact row per pilot/car,
-- refreshed when a session arrives, instead of parsing everyone's telemetry on each visit.
ALTER TABLE training_sessions ADD COLUMN lap_count INTEGER NOT NULL DEFAULT 0;
UPDATE training_sessions SET lap_count=json_array_length(laps);
CREATE INDEX training_sessions_recent ON training_sessions(user_id,started_at DESC);
CREATE INDEX training_live_car_recent ON training_live(circuit,car,user_id,started_at DESC);
CREATE TABLE training_memo_pilots (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  circuit TEXT NOT NULL,
  track TEXT NOT NULL,
  car TEXT NOT NULL,
  car_class TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  summary TEXT NOT NULL CHECK(json_valid(summary)),
  stops TEXT NOT NULL CHECK(json_valid(stops)),
  PRIMARY KEY(user_id,circuit,car)
);
CREATE INDEX training_memo_recent ON training_memo_pilots(started_at);
CREATE INDEX training_memo_car ON training_memo_pilots(circuit,car,started_at);
