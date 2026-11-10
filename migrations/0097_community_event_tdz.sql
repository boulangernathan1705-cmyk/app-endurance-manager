-- EVENT TDZ et Gridfest : un drapeau par communauté au lieu du nom « tdz » écrit dans le code.
-- Seule la communauté TDZ l'a ; une autre pourra l'avoir plus tard sans toucher au code.
ALTER TABLE communities ADD COLUMN event_tdz INTEGER NOT NULL DEFAULT 0;
UPDATE communities SET event_tdz = 1 WHERE slug = 'tdz';
