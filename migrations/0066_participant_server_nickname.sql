-- A Discord pilot shows his nickname on the community's Discord server (else his Discord name).
UPDATE participants SET name = (
  SELECT m.nickname FROM memberships m WHERE m.user_id = participants.user_id AND m.community_id = participants.community_id
) WHERE user_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM memberships m WHERE m.user_id = participants.user_id AND m.community_id = participants.community_id AND m.nickname != ''
);
