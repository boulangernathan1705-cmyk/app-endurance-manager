-- Opt-in only: existing webhooks and message identities remain untouched.
CREATE TABLE community_recap_settings (
  community_id TEXT PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  adopted INTEGER NOT NULL DEFAULT 0 CHECK(adopted IN (0,1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  mode TEXT NOT NULL CHECK(mode IN ('general','events')),
  scope TEXT NOT NULL CHECK(scope IN ('all','lmu','iracing')),
  guild_id TEXT NOT NULL,
  destination_id TEXT NOT NULL,
  destination_name TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  checked_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  lock_token TEXT NOT NULL DEFAULT '',
  lock_until INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 0
);
-- No event FK: a deleted event must not orphan its Discord channel.
CREATE TABLE discord_recap_publications (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  category_id TEXT,
  channel_id TEXT,
  message_id TEXT,
  marker TEXT NOT NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  delete_after INTEGER,
  closed_at INTEGER,
  checked_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(community_id,event_id)
);
