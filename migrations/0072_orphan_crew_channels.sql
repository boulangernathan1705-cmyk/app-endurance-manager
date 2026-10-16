-- Rotate automatic recovery across communities and untracked channels.
ALTER TABLE community_crew_discord ADD COLUMN orphan_checked_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE community_crew_discord ADD COLUMN orphan_cursor TEXT NOT NULL DEFAULT '';
