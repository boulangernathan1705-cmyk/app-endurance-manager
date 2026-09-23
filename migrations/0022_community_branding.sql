-- Contexte de communauté par défaut et personnalisation légère.
ALTER TABLE users ADD COLUMN preferred_community_id TEXT;
ALTER TABLE organizations ADD COLUMN logo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN banner_url TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN accent_color TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN discord_icon_url TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN discord_banner_url TEXT NOT NULL DEFAULT '';
CREATE INDEX users_preferred_community ON users(preferred_community_id);
