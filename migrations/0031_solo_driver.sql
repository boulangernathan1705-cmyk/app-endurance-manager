-- Endurances raced alone: a driver can enter a race with driver changes without a team-mate.
-- events.driver_change_required: NULL = site rule (always on LMU; on iRacing, races over 4 h).
ALTER TABLE events ADD COLUMN driver_change_required INTEGER CHECK(driver_change_required IS NULL OR driver_change_required IN (0,1));
ALTER TABLE registrations ADD COLUMN solo_driver INTEGER NOT NULL DEFAULT 0 CHECK(solo_driver IN (0,1));
