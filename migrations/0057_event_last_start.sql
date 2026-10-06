-- The last start of each race (ms), kept by triggers: the list of upcoming races and the archive filter on this
-- indexed column instead of reading every race's departures (D1 counts every row read).
ALTER TABLE events ADD COLUMN last_start INTEGER;
UPDATE events SET last_start=(SELECT max(CAST(json_extract(d.value,'$.startsAt') AS INTEGER)) FROM json_each(events.departures) d);
CREATE INDEX IF NOT EXISTS events_community_last_start ON events(community_id, last_start);
DROP TRIGGER IF EXISTS events_last_start_insert;
CREATE TRIGGER events_last_start_insert AFTER INSERT ON events BEGIN
  UPDATE events SET last_start=(SELECT max(CAST(json_extract(d.value,'$.startsAt') AS INTEGER)) FROM json_each(NEW.departures) d) WHERE id=NEW.id;
END;
DROP TRIGGER IF EXISTS events_last_start_update;
CREATE TRIGGER events_last_start_update AFTER UPDATE OF departures ON events BEGIN
  UPDATE events SET last_start=(SELECT max(CAST(json_extract(d.value,'$.startsAt') AS INTEGER)) FROM json_each(NEW.departures) d) WHERE id=NEW.id;
END;
