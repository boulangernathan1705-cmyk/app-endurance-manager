-- Fiches combo (server/combos.mjs, module "combos"): what a team measures in practice on one car and one track,
-- sent by each pilot's SimHub plugin, kept from one race to the next. Fresh tables, nothing from the retired modules.

-- A pilot's plugin: one key per pilot and community, which can only send sessions and read the sheets.
CREATE TABLE combo_links (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER,
  PRIMARY KEY(user_id, community_id)
);

-- One session driven by one pilot (the plugin sends it when he goes back to the menus).
CREATE TABLE combo_sessions (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  started_at INTEGER NOT NULL,              -- milliseconds
  track TEXT NOT NULL,
  car TEXT NOT NULL,
  car_class TEXT NOT NULL DEFAULT '',
  driver TEXT NOT NULL DEFAULT '',          -- the pilot's name in the game
  capacity REAL,                            -- litres
  service TEXT CHECK(service IS NULL OR json_valid(service)),  -- the game's service times for the car
  game TEXT CHECK(game IS NULL OR json_valid(game)),           -- the game's own forecast for one lap
  lap_count INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE(user_id, fingerprint)
);
CREATE INDEX combo_sessions_combo ON combo_sessions(community_id, track, car, started_at);

-- One lap. Percent of tyre worn, °C, kPa, litres, percent of virtual energy, seconds; rain and wet from 0 to 1.
-- The three sectors when the game gave them, and the setup loaded in the garage ('' when unknown).
CREATE TABLE combo_laps (
  session_id TEXT NOT NULL REFERENCES combo_sessions(id) ON DELETE CASCADE,
  community_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  track TEXT NOT NULL,
  car TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  n INTEGER NOT NULL,
  t REAL,
  s1 REAL, s2 REAL, s3 REAL,
  fuel REAL,
  ve REAL,
  wear_fl REAL, wear_fr REAL, wear_rl REAL, wear_rr REAL,
  temp_fl REAL, temp_fr REAL, temp_rl REAL, temp_rr REAL,
  kpa_fl REAL, kpa_fr REAL, kpa_rl REAL, kpa_rr REAL,
  brake_fl REAL, brake_fr REAL, brake_rl REAL, brake_rr REAL,
  compound TEXT NOT NULL DEFAULT '',
  track_temp REAL,
  air_temp REAL,
  rain REAL,
  wet REAL,
  top REAL,
  invalid INTEGER NOT NULL DEFAULT 0,
  pit INTEGER NOT NULL DEFAULT 0,
  setup TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(session_id, n)
);
CREATE INDEX combo_laps_combo ON combo_laps(community_id, track, car, started_at);

-- One stop in the pit lane: lane time from entry to exit, time stopped, what was added.
CREATE TABLE combo_stops (
  session_id TEXT NOT NULL REFERENCES combo_sessions(id) ON DELETE CASCADE,
  community_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  track TEXT NOT NULL,
  car TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  lap INTEGER NOT NULL,
  lane REAL NOT NULL,
  stopped REAL NOT NULL,
  fuel REAL NOT NULL DEFAULT 0,
  ve REAL NOT NULL DEFAULT 0,
  tyres INTEGER NOT NULL DEFAULT 0,
  repair INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(session_id, idx)
);
CREATE INDEX combo_stops_combo ON combo_stops(community_id, track, car);

-- Periods the team names: a race being prepared (« 24h du Mans 2026 », optionally on one track) or a game
-- version / BoP (from its date until the next one). A session belongs to them by its date, so changing a
-- period's dates sorts the data again.
CREATE TABLE combo_periods (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('event', 'version')),
  name TEXT NOT NULL,
  track TEXT,                               -- events only; NULL: every track
  starts_at INTEGER NOT NULL,               -- milliseconds
  ends_at INTEGER,                          -- events only
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX combo_periods_community ON combo_periods(community_id, kind, starts_at);

-- The team's notes on a combo.
CREATE TABLE combo_notes (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  track TEXT NOT NULL,
  car TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX combo_notes_combo ON combo_notes(community_id, track, car, created_at);

-- Each pilot's colour on the sheets and the overlay.
CREATE TABLE combo_colors (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  color TEXT NOT NULL CHECK(color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  PRIMARY KEY(community_id, user_id)
);
