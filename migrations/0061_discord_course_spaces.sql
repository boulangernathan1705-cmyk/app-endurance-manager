-- Optional separate iRacing category; NULL keeps the existing single-category configuration.
ALTER TABLE community_recap_settings ADD COLUMN iracing_destination_id TEXT;
ALTER TABLE community_recap_settings ADD COLUMN iracing_destination_name TEXT;
-- Keep race identity/deadline even when the event is removed from the site.
ALTER TABLE crew_discord ADD COLUMN event_id TEXT;
ALTER TABLE crew_discord ADD COLUMN delete_after INTEGER;
ALTER TABLE crew_discord ADD COLUMN voice_layout_hash TEXT NOT NULL DEFAULT '';
UPDATE crew_discord SET event_id=(SELECT event_id FROM crews WHERE crews.id=crew_discord.crew_id);
CREATE INDEX crew_discord_event ON crew_discord(community_id,event_id,guild_id) WHERE closed_at IS NULL;
