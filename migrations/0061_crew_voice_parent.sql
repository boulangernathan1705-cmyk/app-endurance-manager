-- The category a crew's voice channel is in: the race's category once the recap made it (one category per race).
ALTER TABLE crew_discord ADD COLUMN parent_id TEXT;
