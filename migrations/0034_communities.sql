-- Communities: the platform hosts several simracing communities, each one strictly separate.
-- Step 1: the communities table, a community_id on every piece of data, and the first community
-- "commu-dev" (test and development) which receives all the existing data. Accounts (users), sessions,
-- OAuth states and rate limits stay shared by the whole platform.

CREATE TABLE communities (
  id TEXT PRIMARY KEY,
  -- Address: <slug>.endurance-manager.app. Lowercase letters, digits and dashes; fixed once created.
  slug TEXT NOT NULL UNIQUE CHECK (
    length(slug) BETWEEN 2 AND 40
    AND slug NOT GLOB '*[^a-z0-9-]*'
    AND slug NOT GLOB '-*' AND slug NOT GLOB '*-'
    AND slug NOT IN ('www','app','api','admin','dev','auth')
  ),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  short_name TEXT NOT NULL CHECK (length(trim(short_name)) BETWEEN 1 AND 12),
  -- Discord server of the community (access through it comes with step 2).
  discord_guild_id TEXT CHECK (discord_guild_id IS NULL OR discord_guild_id NOT GLOB '*[^0-9]*'),
  -- Banner, logo, colors, favicon (step 4) and enabled modules, as JSON.
  appearance TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(appearance)),
  modules TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(modules)),
  created_at INTEGER NOT NULL
);
CREATE TRIGGER community_slug_fixed BEFORE UPDATE OF slug ON communities BEGIN
  SELECT RAISE(ABORT, 'community_slug_fixed') WHERE NEW.slug IS NOT OLD.slug;
END;

-- The test and development community. It keeps the modules the site uses today.
INSERT INTO communities(id, slug, name, short_name, modules, created_at)
VALUES ('e0a1c0de-0000-4000-8000-000000000001', 'commu-dev', 'Commu Dev', 'DEV',
        '{"iracingImport":true,"discordWeekly":true}', CAST(strftime('%s','now') AS INTEGER));

-- community_id on every piece of data. SQLite cannot add a NOT NULL column referencing another table,
-- so the link is checked by the triggers below; the '' default is refused for any new row.
ALTER TABLE events ADD COLUMN community_id TEXT NOT NULL DEFAULT '';
ALTER TABLE registrations ADD COLUMN community_id TEXT NOT NULL DEFAULT '';
ALTER TABLE crews ADD COLUMN community_id TEXT NOT NULL DEFAULT '';
ALTER TABLE participants ADD COLUMN community_id TEXT NOT NULL DEFAULT '';
ALTER TABLE client_errors ADD COLUMN community_id TEXT NOT NULL DEFAULT '';
ALTER TABLE discord_weekly_state ADD COLUMN community_id TEXT NOT NULL DEFAULT '';

-- All existing data goes to commu-dev.
UPDATE events SET community_id='e0a1c0de-0000-4000-8000-000000000001';
UPDATE registrations SET community_id='e0a1c0de-0000-4000-8000-000000000001';
UPDATE crews SET community_id='e0a1c0de-0000-4000-8000-000000000001';
UPDATE participants SET community_id='e0a1c0de-0000-4000-8000-000000000001';
UPDATE client_errors SET community_id='e0a1c0de-0000-4000-8000-000000000001';
-- The weekly Discord recap state is kept per community (key "<community id>:<previous key>").
UPDATE discord_weekly_state SET community_id='e0a1c0de-0000-4000-8000-000000000001',
  key='e0a1c0de-0000-4000-8000-000000000001:' || key;

CREATE INDEX events_community ON events(community_id, created_at DESC);
CREATE INDEX registrations_community ON registrations(community_id, event_id, departure_id);
CREATE INDEX crews_community ON crews(community_id, event_id, departure_id);
CREATE INDEX client_errors_community ON client_errors(community_id, created_at DESC);

-- A pilot entry (participant) is per community: one per Discord account and per community.
DROP INDEX IF EXISTS participants_user;
DROP INDEX IF EXISTS participants_guest;
CREATE UNIQUE INDEX participants_user ON participants(community_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX participants_guest ON participants(community_id, guest_hash) WHERE guest_hash IS NOT NULL;

-- Official iRacing races are imported per community (own races, entries and crews): one import
-- record per community and per race.
CREATE TABLE iracing_imports_by_community (
  community_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  event_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (community_id, external_id)
);
INSERT INTO iracing_imports_by_community(community_id, external_id, event_id, created_at)
  SELECT 'e0a1c0de-0000-4000-8000-000000000001', external_id, event_id, created_at FROM iracing_imports;
DROP TABLE iracing_imports;
ALTER TABLE iracing_imports_by_community RENAME TO iracing_imports;

-- Separation guards, enforced by the database itself:
-- 1. every new row belongs to an existing community;
-- 2. an entry, a crew or a crew membership belongs to the community of its race (and of its pilot);
-- 3. no row ever changes community.
CREATE TRIGGER event_community_valid BEFORE INSERT ON events BEGIN
  SELECT RAISE(ABORT, 'community_invalid') WHERE NOT EXISTS (SELECT 1 FROM communities WHERE id = NEW.community_id);
END;
CREATE TRIGGER participant_community_valid BEFORE INSERT ON participants BEGIN
  SELECT RAISE(ABORT, 'community_invalid') WHERE NOT EXISTS (SELECT 1 FROM communities WHERE id = NEW.community_id);
END;
CREATE TRIGGER registration_community_valid BEFORE INSERT ON registrations BEGIN
  SELECT RAISE(ABORT, 'community_mismatch') WHERE
    NEW.community_id IS NOT (SELECT community_id FROM events WHERE id = NEW.event_id)
    OR NEW.community_id IS NOT (SELECT community_id FROM participants WHERE id = NEW.participant_id);
END;
CREATE TRIGGER crew_community_valid BEFORE INSERT ON crews BEGIN
  SELECT RAISE(ABORT, 'community_mismatch') WHERE NEW.community_id IS NOT (SELECT community_id FROM events WHERE id = NEW.event_id);
END;
CREATE TRIGGER crew_member_community_valid BEFORE INSERT ON crew_members BEGIN
  SELECT RAISE(ABORT, 'community_mismatch') WHERE
    (SELECT community_id FROM crews WHERE id = NEW.crew_id) IS NOT (SELECT community_id FROM registrations WHERE id = NEW.registration_id);
END;
CREATE TRIGGER event_community_fixed BEFORE UPDATE OF community_id ON events BEGIN
  SELECT RAISE(ABORT, 'community_fixed') WHERE NEW.community_id IS NOT OLD.community_id;
END;
CREATE TRIGGER registration_community_fixed BEFORE UPDATE OF community_id, event_id ON registrations BEGIN
  SELECT RAISE(ABORT, 'community_fixed') WHERE NEW.community_id IS NOT OLD.community_id OR NEW.event_id IS NOT OLD.event_id;
END;
CREATE TRIGGER crew_community_fixed BEFORE UPDATE OF community_id, event_id ON crews BEGIN
  SELECT RAISE(ABORT, 'community_fixed') WHERE NEW.community_id IS NOT OLD.community_id OR NEW.event_id IS NOT OLD.event_id;
END;
CREATE TRIGGER participant_community_fixed BEFORE UPDATE OF community_id ON participants BEGIN
  SELECT RAISE(ABORT, 'community_fixed') WHERE NEW.community_id IS NOT OLD.community_id;
END;
