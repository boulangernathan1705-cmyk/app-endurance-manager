-- Apply once, after migrations 0001–0003. Existing registrations are preserved.
CREATE TABLE crews (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  departure_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  car TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX crews_departure ON crews(event_id, departure_id);
CREATE TABLE crew_members (
  registration_id TEXT PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE,
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE
);
CREATE INDEX crew_members_crew ON crew_members(crew_id);
CREATE TRIGGER crew_valid_insert BEFORE INSERT ON crews BEGIN
  SELECT RAISE(ABORT, 'crew_invalid') WHERE NOT EXISTS (
    SELECT 1 FROM events e, json_each(e.departures) d, json_each(e.categories) c
    WHERE e.id=NEW.event_id AND json_extract(d.value,'$.id')=NEW.departure_id AND c.value=NEW.category
  );
END;
CREATE TRIGGER crew_valid_update BEFORE UPDATE ON crews BEGIN
  SELECT RAISE(ABORT, 'crew_invalid') WHERE NOT EXISTS (
    SELECT 1 FROM events e, json_each(e.departures) d, json_each(e.categories) c
    WHERE e.id=NEW.event_id AND json_extract(d.value,'$.id')=NEW.departure_id AND c.value=NEW.category
  );
  SELECT RAISE(ABORT, 'crew_category_in_use') WHERE EXISTS (
    SELECT 1 FROM crew_members m JOIN registrations r ON r.id=m.registration_id
    WHERE m.crew_id=OLD.id AND (r.event_id!=NEW.event_id OR r.departure_id!=NEW.departure_id OR (r.category!='' AND r.category!=NEW.category))
  );
END;
CREATE TRIGGER crew_member_valid BEFORE INSERT ON crew_members BEGIN
  SELECT RAISE(ABORT, 'crew_membership_invalid') WHERE NOT EXISTS (
    SELECT 1 FROM crews c JOIN registrations r ON r.id=NEW.registration_id
    WHERE c.id=NEW.crew_id AND c.event_id=r.event_id AND c.departure_id=r.departure_id
      AND c.category=r.category AND r.status!='unavailable'
  );
END;
CREATE TRIGGER assigned_registration_category BEFORE UPDATE OF category ON registrations BEGIN
  SELECT RAISE(ABORT, 'crew_category_in_use') WHERE NEW.category!='' AND EXISTS (
    SELECT 1 FROM crew_members m JOIN crews c ON c.id=m.crew_id
    WHERE m.registration_id=OLD.id AND c.category!=NEW.category
  );
END;
CREATE TRIGGER event_crews_valid BEFORE UPDATE OF categories, departures ON events BEGIN
  SELECT RAISE(ABORT, 'crew_event_in_use') WHERE EXISTS (
    SELECT 1 FROM crews c WHERE c.event_id=OLD.id AND (
      NOT EXISTS(SELECT 1 FROM json_each(NEW.categories) k WHERE k.value=c.category)
      OR NOT EXISTS(SELECT 1 FROM json_each(NEW.departures) d WHERE json_extract(d.value,'$.id')=c.departure_id)
    )
  );
END;
