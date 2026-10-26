-- Fiches combo, « Mon analyse »: the session wheel by wheel (averages and extremes, engine temperatures) and the best
-- clean lap of each session point by point, for the lap analysis on the map and the comparison between team-mates.
ALTER TABLE combo_sessions ADD COLUMN expert TEXT;

CREATE TABLE combo_traces (
  session_id TEXT PRIMARY KEY REFERENCES combo_sessions(id) ON DELETE CASCADE,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track TEXT NOT NULL,
  car TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  lap INTEGER NOT NULL,
  lap_time REAL NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX combo_traces_combo ON combo_traces(community_id, track, car, lap_time);
