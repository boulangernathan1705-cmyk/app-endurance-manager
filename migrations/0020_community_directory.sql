-- Annuaire de communautés Endurance Manager et intégration Discord facultative.
-- Une communauté reste utilisable sans serveur Discord lié.
ALTER TABLE organizations ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN language TEXT NOT NULL DEFAULT 'fr';
ALTER TABLE organizations ADD COLUMN games TEXT NOT NULL DEFAULT '["lmu","iracing"]';
ALTER TABLE organizations ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE organizations ADD COLUMN join_mode TEXT NOT NULL DEFAULT 'open';
ALTER TABLE organizations ADD COLUMN discord_guild_id TEXT;
ALTER TABLE organizations ADD COLUMN discord_guild_name TEXT;
ALTER TABLE organizations ADD COLUMN discord_role_id TEXT;
ALTER TABLE organizations ADD COLUMN discord_role_name TEXT;
ALTER TABLE organizations ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

CREATE TABLE organization_join_requests (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(organization_id,user_id)
);
CREATE INDEX organization_join_requests_user ON organization_join_requests(user_id,created_at);
CREATE INDEX organizations_directory ON organizations(type,visibility,name_key);
