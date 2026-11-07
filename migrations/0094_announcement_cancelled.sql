-- The daily poster is drawn once; a race cancelled later in the day is crossed out in the message's text
-- (Nathan, 2026-11-07: « rayer seulement »). The name is kept because a deleted race has none left.
ALTER TABLE discord_announcements ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE discord_announcements ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0;
