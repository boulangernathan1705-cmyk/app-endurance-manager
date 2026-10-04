-- Optional preparation module. Collected sessions belong to the pilot, never to a name supplied by a client.
CREATE TABLE preparation_settings (
  crew_id TEXT PRIMARY KEY REFERENCES crews(id) ON DELETE CASCADE,
  conditions TEXT NOT NULL DEFAULT '{"wet":null,"night":null,"stintMinutes":40}',
  setup_name TEXT,
  setup_bytes BLOB,
  setup_car TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE preparation_profiles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  circuit TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('discover','familiar')),
  PRIMARY KEY(user_id,community_id,circuit)
);
CREATE TABLE preparation_devices (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  last_seen INTEGER,
  PRIMARY KEY(community_id,user_id)
);
CREATE TABLE preparation_sessions (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  game TEXT NOT NULL CHECK(game IN ('lmu','iracing')),
  circuit TEXT NOT NULL,
  car TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  laps TEXT NOT NULL,
  UNIQUE(community_id,user_id,client_id)
);
CREATE INDEX preparation_lookup ON preparation_sessions(community_id,user_id,game,circuit,car,started_at);
