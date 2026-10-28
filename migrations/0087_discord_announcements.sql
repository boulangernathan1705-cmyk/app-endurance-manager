-- « Annonce du jour »: at 7h30 (Paris) the bot announces the day's events and endurances in the channel chosen in the
-- Discord setting (layout.announce). One row per message: item 'intro' (with @everyone), then one per race or event,
-- sent in the order of position (kind: 'intro', 'event' or 'race'; 'none' when the day has nothing). Kept to edit the count of présents and to know the community of an « Absent » click.
CREATE TABLE discord_announcements (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  item TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  content_hash TEXT NOT NULL DEFAULT '',
  checked_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(community_id,day,item)
);
CREATE INDEX discord_announcements_item ON discord_announcements(item,guild_id);
