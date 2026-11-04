CREATE TABLE community_seasons (
  community_id TEXT PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  start_month TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
