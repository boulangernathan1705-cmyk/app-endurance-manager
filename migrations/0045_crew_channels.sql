-- Crews on Discord, second version: instead of a thread in a shared channel, every crew gets its own small
-- category with a text channel and its voice channel right below (Discord always lists the text channels of a
-- category before its voice channels). The first version only ran on the test site: its tables are replaced.
DROP TABLE IF EXISTS crew_discord;
DROP TABLE IF EXISTS community_crew_discord;

-- Settings of a community: where the text channels of finished races go (read-only if that category is), or
-- none (deleted). last_error: why the bot could not do it, shown to the admins.
CREATE TABLE community_crew_discord (
  community_id TEXT PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  archive_category_id TEXT CHECK (archive_category_id IS NULL OR archive_category_id NOT GLOB '*[^0-9]*'),
  last_error TEXT,
  last_error_at INTEGER,
  updated_at INTEGER NOT NULL
);

-- One row = the Discord side of one crew. No foreign key to crews: a deleted crew keeps its row until the bot
-- has closed its channels.
--   members      Discord ids already mentioned in the text channel (a new pilot is welcomed)
--   starts_at    the start the reminders were counted from (a moved start sends them again)
--   reminded     reminders sent: 1 = 24 h before, 2 = 1 h before
--   archived_id  text channel kept in the archives category, deleted 30 days after closing
CREATE TABLE crew_discord (
  crew_id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  category_id TEXT,
  text_id TEXT,
  voice_id TEXT,
  message_id TEXT,
  recap_hash TEXT NOT NULL DEFAULT '',
  members TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(members)),
  starts_at INTEGER,
  reminded INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  archived_id TEXT
);
CREATE INDEX crew_discord_open ON crew_discord(closed_at, checked_at);
CREATE INDEX crew_discord_archived ON crew_discord(archived_id) WHERE archived_id IS NOT NULL;
