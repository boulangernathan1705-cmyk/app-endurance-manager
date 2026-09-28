-- Solo races: an event is either an endurance (crews, hours) or a solo race (one entry per driver,
-- limited places with a waiting list, one or two rounds, OPEN or SAFE access).
ALTER TABLE events ADD COLUMN format TEXT NOT NULL DEFAULT 'endurance';
ALTER TABLE events ADD COLUMN access TEXT NOT NULL DEFAULT 'open';
ALTER TABLE events ADD COLUMN capacity INTEGER;
ALTER TABLE events ADD COLUMN rounds TEXT NOT NULL DEFAULT '[]';
-- "Pilote SAFE": set by an administrator for now, later filled from a Discord role.
ALTER TABLE users ADD COLUMN safe INTEGER NOT NULL DEFAULT 0;
