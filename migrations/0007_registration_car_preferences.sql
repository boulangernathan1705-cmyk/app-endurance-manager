-- Multiple LMU car preferences and an explicit "any car" choice.
-- Existing registrations keep their legacy car value and are read compatibly.
ALTER TABLE registrations ADD COLUMN car_preferences TEXT NOT NULL DEFAULT '[]';
ALTER TABLE registrations ADD COLUMN car_any INTEGER NOT NULL DEFAULT 0;
