-- Official races (iRacing's official endurances, LMU official events set by the platform managers): common to
-- every community. Such a race belongs to no community: community_id = 'official' (never a real community, whose
-- ids are UUIDs; a race left without community, '', is still refused). Each entry and each crew on it keeps the
-- community of its pilot, and a crew never mixes communities (crew_member_community_valid is unchanged).
-- Nothing else changes: every existing race stays in its community.

DROP TRIGGER event_community_valid;
CREATE TRIGGER event_community_valid BEFORE INSERT ON events BEGIN
  SELECT RAISE(ABORT, 'community_invalid') WHERE NEW.community_id <> 'official' AND NOT EXISTS (SELECT 1 FROM communities WHERE id = NEW.community_id);
END;

-- An entry: in an existing community, the one of its pilot, and the one of its race unless the race is official.
DROP TRIGGER registration_community_valid;
CREATE TRIGGER registration_community_valid BEFORE INSERT ON registrations BEGIN
  SELECT RAISE(ABORT, 'community_mismatch') WHERE
    NOT EXISTS (SELECT 1 FROM communities WHERE id = NEW.community_id)
    OR COALESCE((SELECT community_id FROM events WHERE id = NEW.event_id), '#none') NOT IN ('official', NEW.community_id)
    OR NEW.community_id IS NOT (SELECT community_id FROM participants WHERE id = NEW.participant_id);
END;

-- A crew: in an existing community, the one of its race unless the race is official.
DROP TRIGGER crew_community_valid;
CREATE TRIGGER crew_community_valid BEFORE INSERT ON crews BEGIN
  SELECT RAISE(ABORT, 'community_mismatch') WHERE
    NOT EXISTS (SELECT 1 FROM communities WHERE id = NEW.community_id)
    OR COALESCE((SELECT community_id FROM events WHERE id = NEW.event_id), '#none') NOT IN ('official', NEW.community_id);
END;

-- A race never changes community, except to become official (« Rendre officielle »): its entries and crews keep
-- their community.
DROP TRIGGER event_community_fixed;
CREATE TRIGGER event_community_fixed BEFORE UPDATE OF community_id ON events BEGIN
  SELECT RAISE(ABORT, 'community_fixed') WHERE NEW.community_id IS NOT OLD.community_id AND NEW.community_id <> 'official';
END;

-- On an official race, two pilots of two communities may have the same name: the names are unique within a
-- community only. One Discord account still enters a start once, whatever the community (a pilot drives one car;
-- idx_registration_user_category is unchanged).
DROP INDEX idx_registration_name_category;
CREATE UNIQUE INDEX idx_registration_name_category ON registrations(event_id, departure_id, community_id, name_key, category);
DROP INDEX idx_registration_owner_category;
CREATE UNIQUE INDEX idx_registration_owner_category ON registrations(event_id, departure_id, community_id, owner_user_id, name_key, category)
  WHERE user_id IS NULL AND guest_hash IS NULL AND owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS events_official ON events(created_at DESC) WHERE community_id = 'official';
