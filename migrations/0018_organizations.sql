-- Teams privées et communautés ouvertes autour des événements officiels.
-- Additif : les inscriptions et équipages existants restent dans le contexte général (organization_id NULL).
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('team','community')),
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(type,name_key)
);
CREATE INDEX organizations_owner ON organizations(owner_user_id);

CREATE TABLE organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','manager','member')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(organization_id,user_id)
);
CREATE INDEX organization_members_user ON organization_members(user_id);

ALTER TABLE registrations ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE crews ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT;
CREATE INDEX registrations_organization ON registrations(organization_id,event_id,departure_id);
CREATE INDEX crews_organization ON crews(organization_id,event_id,departure_id);

CREATE TRIGGER organization_member_one_team BEFORE INSERT ON organization_members
WHEN (SELECT type FROM organizations WHERE id=NEW.organization_id)='team'
BEGIN
  SELECT RAISE(ABORT,'one_team_only') WHERE EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id=om.organization_id
    WHERE om.user_id=NEW.user_id AND o.type='team' AND om.organization_id!=NEW.organization_id
  );
END;

CREATE TRIGGER organization_member_one_team_update BEFORE UPDATE OF organization_id,user_id ON organization_members
WHEN (SELECT type FROM organizations WHERE id=NEW.organization_id)='team'
BEGIN
  SELECT RAISE(ABORT,'one_team_only') WHERE EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id=om.organization_id
    WHERE om.user_id=NEW.user_id AND o.type='team' AND om.organization_id!=OLD.organization_id
  );
END;

CREATE TRIGGER registration_one_organization BEFORE INSERT ON registrations
BEGIN
  SELECT RAISE(ABORT,'participant_other_organization') WHERE EXISTS (
    SELECT 1 FROM registrations r
    WHERE r.participant_id=NEW.participant_id
      AND r.event_id=NEW.event_id
      AND r.departure_id=NEW.departure_id
      AND COALESCE(r.organization_id,'')!=COALESCE(NEW.organization_id,'')
  );
END;

CREATE TRIGGER registration_organization_fixed BEFORE UPDATE OF organization_id ON registrations
BEGIN
  SELECT RAISE(ABORT,'organization_fixed') WHERE COALESCE(NEW.organization_id,'')!=COALESCE(OLD.organization_id,'');
END;

CREATE TRIGGER crew_organization_fixed BEFORE UPDATE OF organization_id ON crews
BEGIN
  SELECT RAISE(ABORT,'organization_fixed') WHERE COALESCE(NEW.organization_id,'')!=COALESCE(OLD.organization_id,'');
END;

CREATE TRIGGER crew_member_same_organization BEFORE INSERT ON crew_members
BEGIN
  SELECT RAISE(ABORT,'organization_mismatch') WHERE EXISTS (
    SELECT 1 FROM crews c JOIN registrations r ON r.id=NEW.registration_id
    WHERE c.id=NEW.crew_id AND COALESCE(c.organization_id,'')!=COALESCE(r.organization_id,'')
  );
END;
