-- The communities whose Discord follows a change on the site (an entry, a crew, a race): gathered here and done every
-- 2 minutes in one pass each, rather than one pass per change (a burst of entries made Discord limit the bot).
CREATE TABLE discord_pending (
  community_id TEXT PRIMARY KEY,
  event_id TEXT,
  queued_at INTEGER NOT NULL
);
