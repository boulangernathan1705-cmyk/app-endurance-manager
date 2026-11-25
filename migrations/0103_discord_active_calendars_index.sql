-- The pending recap check only inspects the format of calendars with a published message.
CREATE INDEX discord_active_calendars_by_community
ON discord_recap_publications(community_id, content_hash)
WHERE closed_at IS NULL AND event_id LIKE 'week:calendar%' AND message_id IS NOT NULL;
