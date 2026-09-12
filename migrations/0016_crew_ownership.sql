-- Pilots can own and manage a crew without receiving event-management rights.
-- Existing crews keep their organizer supervision and, when possible, the first
-- Discord-linked member becomes the initial crew owner.
ALTER TABLE crews ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX crews_owner_user ON crews(owner_user_id);

UPDATE crews
SET owner_user_id = (
  SELECT p.user_id
  FROM crew_members cm
  JOIN registrations r ON r.id = cm.registration_id
  JOIN participants p ON p.id = r.participant_id
  WHERE cm.crew_id = crews.id
    AND p.user_id IS NOT NULL
  ORDER BY r.created_at, r.id
  LIMIT 1
)
WHERE owner_user_id IS NULL;
