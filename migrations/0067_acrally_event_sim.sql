-- Broaden the simulator check without rebuilding events or its foreign-key relationships.
-- Keep the previous column as a snapshot; all application reads/writes use the new sim column.
ALTER TABLE events RENAME COLUMN sim TO legacy_sim;
ALTER TABLE events ADD COLUMN sim TEXT CHECK(sim IS NULL OR sim IN ('lmu','iracing','ams2','ace','acrally'));
UPDATE events SET sim=legacy_sim;
