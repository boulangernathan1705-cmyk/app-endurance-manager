-- Serialize explicit setup calls; no link to a community or race activation.
CREATE TABLE official_discord_setup (
  guild_id TEXT PRIMARY KEY,
  lock_token TEXT NOT NULL DEFAULT '',
  lock_until INTEGER NOT NULL DEFAULT 0,
  message_ids TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(message_ids))
);
