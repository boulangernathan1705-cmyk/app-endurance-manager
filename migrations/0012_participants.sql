-- Apply once after 0011. Additive migration: no table or registration is deleted.
CREATE TABLE participants (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 user_id TEXT REFERENCES users(id),
 guest_hash TEXT,
 created_by TEXT REFERENCES users(id),
 created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX participants_user ON participants(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX participants_guest ON participants(guest_hash) WHERE guest_hash IS NOT NULL;
ALTER TABLE registrations ADD COLUMN participant_id TEXT REFERENCES participants(id);

-- Only identities proven by the existing account/owner/token are grouped.
INSERT INTO participants(id,name,user_id,guest_hash,created_by,created_at)
SELECT MIN(id),name,user_id,
 CASE WHEN user_id IS NULL AND owner_user_id IS NULL THEN guest_hash ELSE NULL END,
 owner_user_id,MIN(created_at)
FROM registrations
GROUP BY CASE WHEN user_id IS NOT NULL THEN 'u:'||user_id
 WHEN owner_user_id IS NOT NULL THEN 'm:'||owner_user_id||':'||name_key
 ELSE 'g:'||guest_hash END;
UPDATE registrations SET participant_id=(
 SELECT p.id FROM participants p JOIN registrations source ON source.id=p.id
 WHERE (registrations.user_id IS NOT NULL AND source.user_id=registrations.user_id)
 OR (registrations.user_id IS NULL AND registrations.owner_user_id IS NOT NULL
     AND source.user_id IS NULL AND source.owner_user_id=registrations.owner_user_id AND source.name_key=registrations.name_key)
 OR (registrations.user_id IS NULL AND registrations.owner_user_id IS NULL
     AND source.user_id IS NULL AND source.owner_user_id IS NULL AND source.guest_hash=registrations.guest_hash)
);
CREATE UNIQUE INDEX registration_participant_category ON registrations(event_id,departure_id,participant_id,category);
CREATE INDEX registration_participant ON registrations(participant_id);

CREATE TRIGGER registration_participant_required BEFORE INSERT ON registrations BEGIN
 SELECT RAISE(ABORT,'participant_required') WHERE NEW.participant_id IS NULL;
END;
CREATE TRIGGER registration_participant_fixed BEFORE UPDATE OF participant_id ON registrations BEGIN
 SELECT RAISE(ABORT,'participant_fixed') WHERE NEW.participant_id IS NOT OLD.participant_id;
END;
CREATE TRIGGER participant_assigned_insert BEFORE INSERT ON registrations BEGIN
 SELECT RAISE(ABORT,'participant_already_assigned') WHERE EXISTS (
 SELECT 1 FROM crew_members m JOIN registrations r ON r.id=m.registration_id
 WHERE r.participant_id=NEW.participant_id AND r.event_id=NEW.event_id AND r.departure_id=NEW.departure_id);
END;
CREATE TRIGGER participant_assigned_update BEFORE UPDATE OF category,status,event_id,departure_id ON registrations BEGIN
 SELECT RAISE(ABORT,'participant_already_assigned') WHERE EXISTS (
 SELECT 1 FROM crew_members m JOIN registrations r ON r.id=m.registration_id
 WHERE r.participant_id=NEW.participant_id AND r.event_id=NEW.event_id AND r.departure_id=NEW.departure_id
 AND (r.id!=NEW.id OR NEW.category!=r.category OR NEW.status='unavailable'));
END;
CREATE TRIGGER participant_one_crew BEFORE INSERT ON crew_members BEGIN
 SELECT RAISE(ABORT,'participant_already_assigned') WHERE EXISTS (
 SELECT 1 FROM registrations selected JOIN registrations other
 ON other.participant_id=selected.participant_id AND other.event_id=selected.event_id AND other.departure_id=selected.departure_id
 JOIN crew_members m ON m.registration_id=other.id WHERE selected.id=NEW.registration_id);
END;
