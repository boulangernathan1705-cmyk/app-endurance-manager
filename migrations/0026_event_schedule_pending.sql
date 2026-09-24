-- Une course peut être publiée avant que ses horaires soient confirmés.
ALTER TABLE events ADD COLUMN schedule_pending INTEGER NOT NULL DEFAULT 0;

-- Les organisateurs l'indiquaient jusqu'ici dans le nom : « 6h FUJI (horaires non définies par LMU) ».
-- On retire cette mention du nom et on la remplace par l'indicateur.
UPDATE events
SET name = rtrim(substr(name, 1, instr(lower(name), '(horaires') - 1)),
    schedule_pending = 1,
    version = version + 1
WHERE instr(lower(name), '(horaires') > 1;
