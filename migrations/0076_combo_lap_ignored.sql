-- A lap its pilot takes out of the fiches combo (a test, a lap not driven for real): kept, but no longer counted.
ALTER TABLE combo_laps ADD COLUMN ignored INTEGER NOT NULL DEFAULT 0;
