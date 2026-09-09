-- Allow a pilot already assigned to one crew to keep additional category registrations on the same departure.
-- The crew membership trigger still guarantees that the participant can belong to only one crew.
DROP TRIGGER IF EXISTS participant_assigned_insert;
DROP TRIGGER IF EXISTS participant_assigned_update;

CREATE TRIGGER participant_assigned_update BEFORE UPDATE OF category,status,event_id,departure_id ON registrations BEGIN
 SELECT RAISE(ABORT,'participant_already_assigned') WHERE EXISTS (
   SELECT 1 FROM crew_members m
   WHERE m.registration_id=OLD.id
 ) AND (NEW.category!=OLD.category OR NEW.status='unavailable' OR NEW.event_id!=OLD.event_id OR NEW.departure_id!=OLD.departure_id);
END;
