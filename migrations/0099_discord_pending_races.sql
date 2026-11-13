-- The races changed on the site since their community's last Discord pass: every one of them is updated first, not only
-- the last one changed (discord_pending keeps one row per community).
CREATE TABLE discord_pending_races (
  community_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  queued_at INTEGER NOT NULL,
  PRIMARY KEY (community_id, event_id)
);
