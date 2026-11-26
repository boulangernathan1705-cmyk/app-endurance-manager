ALTER TABLE iracing_imports ADD COLUMN source_identity TEXT;
ALTER TABLE iracing_imports ADD COLUMN source_metadata TEXT;
ALTER TABLE iracing_imports ADD COLUMN reconcile_token TEXT;
CREATE UNIQUE INDEX iracing_imports_identity ON iracing_imports(community_id, source_identity) WHERE source_identity IS NOT NULL;

CREATE TABLE iracing_sync_sources (
  name TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  etag TEXT,
  saved_at INTEGER NOT NULL
);

CREATE TABLE iracing_sync_lock (
  id INTEGER PRIMARY KEY CHECK(id=1),
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
INSERT INTO iracing_sync_lock VALUES(1, '', 0);

CREATE TABLE iracing_sync_runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL
);
CREATE INDEX iracing_sync_runs_recent ON iracing_sync_runs(mode, started_at DESC);

CREATE TABLE iracing_sync_conflicts (
  source_key TEXT PRIMARY KEY,
  event_id TEXT,
  name TEXT NOT NULL,
  details TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX iracing_sync_open_conflicts ON iracing_sync_conflicts(resolved_at, updated_at DESC);

ALTER TABLE events ADD COLUMN official_schedule_status TEXT
  CHECK(official_schedule_status IN ('postponed','cancelled'));
