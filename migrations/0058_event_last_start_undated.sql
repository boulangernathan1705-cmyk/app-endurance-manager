-- A race without a start date counts as upcoming: its last_start is the far future instead of NULL, so the
-- upcoming filter is a plain range (last_start > cutoff) that the index serves without reading other races.
UPDATE events SET last_start=COALESCE((SELECT max(CAST(json_extract(d.value,'$.startsAt') AS INTEGER)) FROM json_each(events.departures) d), 9007199254740991);
DROP TRIGGER IF EXISTS events_last_start_insert;
CREATE TRIGGER events_last_start_insert AFTER INSERT ON events BEGIN
  UPDATE events SET last_start=COALESCE((SELECT max(CAST(json_extract(d.value,'$.startsAt') AS INTEGER)) FROM json_each(NEW.departures) d), 9007199254740991) WHERE id=NEW.id;
END;
DROP TRIGGER IF EXISTS events_last_start_update;
CREATE TRIGGER events_last_start_update AFTER UPDATE OF departures ON events BEGIN
  UPDATE events SET last_start=COALESCE((SELECT max(CAST(json_extract(d.value,'$.startsAt') AS INTEGER)) FROM json_each(NEW.departures) d), 9007199254740991) WHERE id=NEW.id;
END;
