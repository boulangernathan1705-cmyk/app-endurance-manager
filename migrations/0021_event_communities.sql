-- Une endurance peut rester générale (NULL) ou appartenir à une communauté.
ALTER TABLE events ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT;
CREATE INDEX events_organization ON events(organization_id,created_at DESC);
