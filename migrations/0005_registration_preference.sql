-- Optional partner preference entered with an individual registration.
ALTER TABLE registrations ADD COLUMN preferred_pilot TEXT NOT NULL DEFAULT '';
