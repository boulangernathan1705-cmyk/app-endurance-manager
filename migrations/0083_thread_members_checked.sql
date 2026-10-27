-- When the bot last found nobody left to add to a race's thread: not looked at again for an hour (fewer rows read).
ALTER TABLE discord_recap_publications ADD COLUMN members_checked_at INTEGER NOT NULL DEFAULT 0;
