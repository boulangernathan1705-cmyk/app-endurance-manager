CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'pilot' CHECK(role IN ('pilot','organizer')),
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_oauth_expiry ON oauth_states(expires_at);
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  categories TEXT NOT NULL CHECK(json_valid(categories)),
  departures TEXT NOT NULL CHECK(json_valid(departures)),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_events_created ON events(created_at DESC);
CREATE TABLE registrations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  departure_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  guest_hash TEXT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  CHECK((user_id IS NULL AND guest_hash IS NOT NULL) OR (user_id IS NOT NULL AND guest_hash IS NULL)),
  UNIQUE(event_id, departure_id, name_key)
);
CREATE UNIQUE INDEX idx_registration_user ON registrations(event_id, departure_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_registration_guest ON registrations(event_id, departure_id, guest_hash) WHERE guest_hash IS NOT NULL;
CREATE INDEX idx_registration_guest_lookup ON registrations(guest_hash) WHERE guest_hash IS NOT NULL;
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_rate_expiry ON rate_limits(expires_at);
