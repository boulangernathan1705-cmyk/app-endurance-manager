-- Fresh, independent schema. No restoration of the retired training tables.
CREATE TABLE memo_contributors (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  consent_at INTEGER NOT NULL
);
CREATE TABLE memo_links (
  user_id TEXT PRIMARY KEY REFERENCES memo_contributors(user_id) ON DELETE CASCADE,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  last_seen INTEGER
);
CREATE TABLE memo_samples (
  user_id TEXT NOT NULL REFERENCES memo_contributors(user_id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(json_valid(scope)),
  metrics TEXT NOT NULL CHECK(json_valid(metrics)),
  started_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, session_id)
);
CREATE INDEX memo_samples_scope ON memo_samples(scope_key, started_at DESC);
CREATE INDEX memo_samples_expiry ON memo_samples(started_at);
CREATE TABLE memo_pit_profiles (
  scope_key TEXT PRIMARY KEY,
  profile TEXT NOT NULL CHECK(json_valid(profile)),
  verified_at INTEGER NOT NULL,
  verified_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE memo_reference (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  fetched_at INTEGER NOT NULL,
  attempted_at INTEGER NOT NULL
);
