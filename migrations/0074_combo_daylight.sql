-- Fiches combo: daylight when a lap ended (0 night, 1 full day; NULL when the plugin could not read it), so night laps
-- are told from day laps on the sheet.
ALTER TABLE combo_laps ADD COLUMN light REAL;
