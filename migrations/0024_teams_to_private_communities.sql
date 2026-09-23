-- Les anciennes Teams deviennent des communautes fermees.
-- Leur identifiant reste identique afin de conserver membres, inscriptions et equipages.
UPDATE organizations
SET name=name || ' · privé',
    name_key=name_key || ' · privé · ' || substr(id,1,8)
WHERE type='team'
  AND EXISTS (
    SELECT 1 FROM organizations community
    WHERE community.type='community'
      AND community.name_key=organizations.name_key
  );

UPDATE organizations
SET type='community',
    visibility='private',
    join_mode='invite',
    updated_at=unixepoch()*1000
WHERE type='team';

DROP TRIGGER IF EXISTS organization_member_one_team;
DROP TRIGGER IF EXISTS organization_member_one_team_update;
