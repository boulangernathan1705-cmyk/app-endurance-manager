-- Une inscription reste unique par pilote/catégorie et peut être partagée avec plusieurs espaces.
-- Les équipages restent rattachés à un seul espace (Général, Team ou Communauté).
CREATE TABLE registration_audiences (
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  audience_key TEXT NOT NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(registration_id,audience_key),
  CHECK(
    (audience_key='general' AND organization_id IS NULL)
    OR (audience_key!='general' AND organization_id=audience_key)
  )
);
CREATE INDEX registration_audiences_organization ON registration_audiences(organization_id,registration_id);

-- Convertit le contexte unique de 0018 en première audience sans dupliquer les inscriptions.
INSERT OR IGNORE INTO registration_audiences(registration_id,audience_key,organization_id,created_at)
SELECT id,COALESCE(organization_id,'general'),organization_id,created_at FROM registrations;

-- Le contexte d'une inscription n'est désormais plus porté par registrations.organization_id.
DROP TRIGGER IF EXISTS registration_one_organization;
DROP TRIGGER IF EXISTS registration_organization_fixed;
DROP TRIGGER IF EXISTS crew_member_same_organization;
UPDATE registrations SET organization_id=NULL WHERE organization_id IS NOT NULL;

-- Une inscription ne peut entrer dans un équipage que si elle est partagée avec l'espace de cet équipage.
CREATE TRIGGER crew_member_audience BEFORE INSERT ON crew_members
BEGIN
  SELECT RAISE(ABORT,'crew_membership_audience') WHERE NOT EXISTS (
    SELECT 1
    FROM crews c
    JOIN registration_audiences a ON a.registration_id=NEW.registration_id
    WHERE c.id=NEW.crew_id
      AND (
        (c.organization_id IS NULL AND a.audience_key='general')
        OR (c.organization_id IS NOT NULL AND a.organization_id=c.organization_id)
      )
  );
END;

-- Tant qu'un pilote est dans un équipage, l'espace nécessaire à cet équipage reste partagé.
CREATE TRIGGER registration_audience_in_use BEFORE DELETE ON registration_audiences
BEGIN
  SELECT RAISE(ABORT,'audience_in_use') WHERE EXISTS (
    SELECT 1
    FROM crew_members cm
    JOIN crews c ON c.id=cm.crew_id
    WHERE cm.registration_id=OLD.registration_id
      AND (
        (c.organization_id IS NULL AND OLD.audience_key='general')
        OR (c.organization_id IS NOT NULL AND OLD.organization_id=c.organization_id)
      )
  );
END;
