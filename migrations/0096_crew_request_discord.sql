-- « Demander un équipage » on Discord: the card the bot posted for a request in the channel chosen by the admins
-- (setting « Discord », layout.requests). Turned green or grey once decided, deleted when no longer useful.
ALTER TABLE crew_requests ADD COLUMN discord_channel_id TEXT;
ALTER TABLE crew_requests ADD COLUMN discord_message_id TEXT;
