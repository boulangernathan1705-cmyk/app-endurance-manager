-- Once a participant is assigned to a crew on a departure, no new category registration may be added for that participant on that departure.
-- Crew assignment itself already deletes the participant's other category registrations.
DROP TRIGGER IF EXISTS participant_assigned_insert;
CREATE TRIGGER participant_assigned_insert BEFORE INSERT ON registrations BEGIN
 SELECT RAISE(ABORT,'participant_already_assigned') WHERE EXISTS (
   SELECT 1 FROM crew_members m JOIN registrations r ON r.id=m.registration_id
   WHERE r.participant_id=NEW.participant_id AND r.event_id=NEW.event_id AND r.departure_id=NEW.departure_id
 );
END;
