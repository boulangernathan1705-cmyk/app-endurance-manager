-- Notifications on the site (the bell next to the account): what happens on the races a player is entered in
-- (a pilot enters his start, someone joins or leaves his crew, the race changes). Kept 30 days. Nothing else changes.
CREATE TABLE notifications (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 -- The community of the player's entry (shown on that community's site; on any of them for an official race).
 community_id TEXT NOT NULL,
 official INTEGER NOT NULL DEFAULT 0,
 kind TEXT NOT NULL,
 -- No foreign key: a deleted race keeps its notification ("La course … a été supprimée").
 event_id TEXT,
 data TEXT NOT NULL DEFAULT '{}',
 created_at INTEGER NOT NULL,
 read_at INTEGER
);
CREATE INDEX notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX notifications_created ON notifications(created_at);
