-- « Prévenir @everyone du calendrier » (Discord setting): the day it was last pinged (Paris, YYYY-MM-DD) and its message,
-- deleted at the next ping. Additive only.
ALTER TABLE community_recap_settings ADD COLUMN calendar_ping_day TEXT NOT NULL DEFAULT '';
ALTER TABLE community_recap_settings ADD COLUMN calendar_ping_channel TEXT NOT NULL DEFAULT '';
ALTER TABLE community_recap_settings ADD COLUMN calendar_ping_message TEXT NOT NULL DEFAULT '';
