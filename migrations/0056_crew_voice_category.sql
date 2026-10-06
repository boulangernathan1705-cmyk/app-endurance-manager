-- Crews on Discord: the category where the bot makes the crews' voice channels, chosen by the admins when they
-- turn the module on (none: at the top of the server).
ALTER TABLE community_crew_discord ADD COLUMN voice_category_id TEXT CHECK (voice_category_id IS NULL OR voice_category_id NOT GLOB '*[^0-9]*');
