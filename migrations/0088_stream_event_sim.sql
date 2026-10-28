-- « Annoncer un stream »: events.sim takes 'stream' (shared/stream.mjs). As in 0067, the check is broadened without
-- rebuilding events: the previous column is kept as a snapshot, the application uses the new sim column.
ALTER TABLE events RENAME COLUMN sim TO legacy_sim_2;
ALTER TABLE events ADD COLUMN sim TEXT CHECK(sim IS NULL OR sim IN ('lmu','iracing','ams2','ace','acrally','stream'));
UPDATE events SET sim=legacy_sim_2;
