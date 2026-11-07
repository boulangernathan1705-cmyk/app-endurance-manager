-- A season's length, chosen by the organisers with its first month (Nathan, 2026-11-07). Seasons follow each other.
ALTER TABLE community_seasons ADD COLUMN months INTEGER NOT NULL DEFAULT 3;
