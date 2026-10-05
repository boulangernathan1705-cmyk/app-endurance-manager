-- The circuit sheet (« mémo », server/training.mjs): what the game says about a car, read by the plugin in LMU's own
-- API. Its service times are the same for everyone who drives it (kept per car), and its forecast for one lap on a
-- track (kept with the live session it came with).
ALTER TABLE training_live ADD COLUMN game TEXT;
CREATE TABLE training_cars (
  car TEXT PRIMARY KEY,
  car_class TEXT NOT NULL,
  service TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX training_live_circuit ON training_live(circuit,car,started_at);
