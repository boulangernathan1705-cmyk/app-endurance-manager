-- Allow one participant to keep one registration per category on the same departure.
-- Existing registrations, crew memberships and ownership are preserved.
PRAGMA foreign_keys=OFF;
DROP TRIGGER IF EXISTS crew_valid_insert;
DROP TRIGGER IF EXISTS crew_valid_update;
DROP TRIGGER IF EXISTS crew_member_valid;
DROP TRIGGER IF EXISTS assigned_registration_category;
DROP TRIGGER IF EXISTS event_crews_valid;
CREATE TABLE registrations_multi_category (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  departure_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  owner_user_id TEXT REFERENCES users(id),
  guest_hash TEXT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  category TEXT NOT NULL,
  car TEXT NOT NULL DEFAULT '',
  car_preferences TEXT NOT NULL DEFAULT '[]',
  car_any INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  preferred_pilot TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  CHECK((user_id IS NULL AND guest_hash IS NOT NULL) OR (user_id IS NOT NULL AND guest_hash IS NULL))
);
INSERT INTO registrations_multi_category(id,event_id,departure_id,user_id,owner_user_id,guest_hash,name,name_key,category,car,car_preferences,car_any,status,preferred_pilot,version,created_at)
SELECT id,event_id,departure_id,user_id,owner_user_id,guest_hash,name,name_key,category,car,car_preferences,car_any,status,preferred_pilot,version,created_at
FROM registrations;
DROP TABLE registrations;
ALTER TABLE registrations_multi_category RENAME TO registrations;
CREATE UNIQUE INDEX idx_registration_user_category ON registrations(event_id, departure_id, user_id, category) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_registration_guest_category ON registrations(event_id, departure_id, guest_hash, category) WHERE guest_hash IS NOT NULL;
CREATE UNIQUE INDEX idx_registration_owner_category ON registrations(event_id, departure_id, owner_user_id, name_key, category) WHERE user_id IS NULL AND guest_hash IS NULL AND owner_user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_registration_name_category ON registrations(event_id, departure_id, name_key, category);
CREATE INDEX idx_registration_guest_lookup ON registrations(guest_hash) WHERE guest_hash IS NOT NULL;
CREATE INDEX idx_registration_owner ON registrations(owner_user_id) WHERE owner_user_id IS NOT NULL;
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
PRAGMA foreign_keys=ON;
