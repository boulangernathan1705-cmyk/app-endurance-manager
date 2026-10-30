-- A durable reservation makes retries silent even if Discord's response or the DB write is lost.
-- Existing days are conservatively treated as already attempted; only a genuinely new day starts at zero.
ALTER TABLE discord_announcements ADD COLUMN ping_attempted INTEGER NOT NULL DEFAULT 1;
ALTER TABLE discord_announcements ADD COLUMN pending_nonce TEXT NOT NULL DEFAULT '';
ALTER TABLE discord_announcements ADD COLUMN pending_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE discord_announcements ADD COLUMN pending_channel_id TEXT NOT NULL DEFAULT '';
