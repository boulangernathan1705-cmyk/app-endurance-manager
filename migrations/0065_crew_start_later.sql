-- « Départ à choisir »: a crew may be created without a start (departure_id ''). Its pilots join it from the
-- start of their choice (their entry stays on that start); the crew then fixes its start and keeps the pilots
-- entered there.
DROP TRIGGER IF EXISTS crew_valid_insert;
DROP TRIGGER IF EXISTS crew_valid_update;
DROP TRIGGER IF EXISTS crew_member_valid;
DROP TRIGGER IF EXISTS event_crews_valid;
CREATE TRIGGER crew_valid_insert BEFORE INSERT ON crews BEGIN
  SELECT RAISE(ABORT, 'crew_invalid') WHERE NOT EXISTS (
    SELECT 1 FROM events e, json_each(e.departures) d, json_each(e.categories) c
    WHERE e.id=NEW.event_id AND (NEW.departure_id='' OR json_extract(d.value,'$.id')=NEW.departure_id) AND c.value=NEW.category
  );
END;
CREATE TRIGGER crew_valid_update BEFORE UPDATE ON crews BEGIN
  SELECT RAISE(ABORT, 'crew_invalid') WHERE NOT EXISTS (
    SELECT 1 FROM events e, json_each(e.departures) d, json_each(e.categories) c
    WHERE e.id=NEW.event_id AND (NEW.departure_id='' OR json_extract(d.value,'$.id')=NEW.departure_id) AND c.value=NEW.category
  );
  SELECT RAISE(ABORT, 'crew_category_in_use') WHERE EXISTS (
    SELECT 1 FROM crew_members m JOIN registrations r ON r.id=m.registration_id
    WHERE m.crew_id=OLD.id AND (r.event_id!=NEW.event_id OR (NEW.departure_id!='' AND r.departure_id!=NEW.departure_id) OR (r.category!='' AND r.category!=NEW.category))
  );
END;
CREATE TRIGGER crew_member_valid BEFORE INSERT ON crew_members BEGIN
  SELECT RAISE(ABORT, 'crew_membership_invalid') WHERE NOT EXISTS (
    SELECT 1 FROM crews c JOIN registrations r ON r.id=NEW.registration_id
    WHERE c.id=NEW.crew_id AND c.event_id=r.event_id AND (c.departure_id='' OR c.departure_id=r.departure_id)
      AND c.category=r.category AND r.status!='unavailable'
  );
END;
CREATE TRIGGER event_crews_valid BEFORE UPDATE OF categories, departures ON events BEGIN
  SELECT RAISE(ABORT, 'crew_event_in_use') WHERE EXISTS (
    SELECT 1 FROM crews c WHERE c.event_id=OLD.id AND (
      NOT EXISTS(SELECT 1 FROM json_each(NEW.categories) k WHERE k.value=c.category)
      OR (c.departure_id!='' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.departures) d WHERE json_extract(d.value,'$.id')=c.departure_id))
    )
  );
END;
