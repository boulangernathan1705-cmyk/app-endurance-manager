-- Crews on Discord (module « Équipages sur Discord », set by the admins on the « Mise en place » page):
-- the bot opens a thread and a voice channel for each crew a few days before its start, keeps a recap message
-- up to date in the thread, and closes both 24 h after the planned end (thread archived, voice channel deleted).
-- Race reminders (module « Rappels de course »): 24 h and 1 h before the start, in the thread and on the bell.

-- Where the bot works on the community's server: the channel of the threads (text or forum) and the category
-- of the voice channels (none: at the top of the server). last_error: why the bot could not do it, shown to admins.
CREATE TABLE community_crew_discord (
  community_id TEXT PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  thread_channel_id TEXT NOT NULL CHECK (thread_channel_id NOT GLOB '*[^0-9]*'),
  thread_channel_forum INTEGER NOT NULL DEFAULT 0 CHECK (thread_channel_forum IN (0,1)),
  voice_category_id TEXT CHECK (voice_category_id IS NULL OR voice_category_id NOT GLOB '*[^0-9]*'),
  last_error TEXT,
  last_error_at INTEGER,
  updated_at INTEGER NOT NULL
);

-- One row = the Discord side of one crew. No foreign key to crews: a deleted crew keeps its row until the bot
-- has closed its thread and voice channel.
--   members   Discord ids already mentioned in the thread (a new pilot is welcomed, which adds him to it)
--   starts_at the start the reminders were counted from (a moved start sends them again)
--   reminded  reminders sent: 1 = 24 h before, 2 = 1 h before
CREATE TABLE crew_discord (
  crew_id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  thread_id TEXT,
  message_id TEXT,
  voice_id TEXT,
  recap_hash TEXT NOT NULL DEFAULT '',
  members TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(members)),
  starts_at INTEGER,
  reminded INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX crew_discord_open ON crew_discord(closed_at, checked_at);

-- Reminders on the bell, once per start and community.
CREATE TABLE race_reminders (
  event_id TEXT NOT NULL,
  departure_id TEXT NOT NULL,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, departure_id, community_id)
);
