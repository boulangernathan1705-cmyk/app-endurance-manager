-- Discord devient la source facultative des membres, organisateurs et annonces d’une communauté.
ALTER TABLE organizations ADD COLUMN discord_sync_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN discord_manager_role_id TEXT;
ALTER TABLE organizations ADD COLUMN discord_manager_role_name TEXT;
ALTER TABLE organizations ADD COLUMN discord_weekly_webhook_url TEXT;
ALTER TABLE organizations ADD COLUMN discord_weekly_game TEXT NOT NULL DEFAULT 'lmu';
