-- The pilots the bot added to a race's thread (server/recap-discord.mjs addThreadMembers): each added once, so the thread
-- stays in their list on Discord; one who leaves it is not added again.
CREATE TABLE discord_thread_members (
  community_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (community_id, event_id, user_id)
);
