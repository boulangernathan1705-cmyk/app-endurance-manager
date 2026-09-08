-- Optional LMU car choice entered with an individual registration.
ALTER TABLE registrations ADD COLUMN car TEXT NOT NULL DEFAULT '';
