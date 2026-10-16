-- Previous syncs could mark cleanup complete after a Discord error while keeping channel ids.
-- Retry those tracked channels; successfully deleted channels already have their ids cleared.
UPDATE crew_discord SET closed_at=NULL, lock_until=0, checked_at=0
WHERE closed_at IS NOT NULL AND (voice_id IS NOT NULL OR text_id IS NOT NULL OR category_id IS NOT NULL);
