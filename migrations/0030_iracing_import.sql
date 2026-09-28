-- Official iRacing endurances imported automatically (server/iracing-import.mjs). A race already
-- imported is never created again, even when an organizer deleted it.
CREATE TABLE IF NOT EXISTS iracing_imports (
  external_id TEXT PRIMARY KEY,
  event_id TEXT,
  created_at INTEGER NOT NULL
);
-- Author of the imported races (events.created_by is required). Never a real Discord account.
INSERT OR IGNORE INTO users(id,name,role,created_at) VALUES('system:iracing','iRacing','organizer',0);
