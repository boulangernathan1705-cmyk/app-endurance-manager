CREATE TABLE client_errors (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  api_path TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  viewport TEXT NOT NULL DEFAULT '',
  online INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_client_errors_created_at ON client_errors(created_at DESC);
