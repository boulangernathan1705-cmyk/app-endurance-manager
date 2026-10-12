-- An optional comment the pilot leaves on his endurance entry.
ALTER TABLE registrations ADD COLUMN comment TEXT NOT NULL DEFAULT '';
