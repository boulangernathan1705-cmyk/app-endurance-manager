-- Communities, step 2: access through the community's Discord server.
-- A player keeps one account (users) for the whole platform; a membership links them to a community,
-- with their roles on its Discord server, checked by the bot when they come and once a day.

CREATE TABLE memberships (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Discord role ids of the player on the community's server (JSON array).
  discord_roles TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(discord_roles)),
  nickname TEXT NOT NULL DEFAULT '',
  -- Owner of the server, or a role with Discord's "Administrator" permission: every permission.
  discord_admin INTEGER NOT NULL DEFAULT 0 CHECK (discord_admin IN (0,1)),
  -- 'member' while on the server; 'left' once the bot no longer finds them (no access any more).
  status TEXT NOT NULL DEFAULT 'member' CHECK (status IN ('member','left')),
  checked_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX memberships_user ON memberships(user_id);
CREATE INDEX memberships_checked ON memberships(checked_at);

-- What each Discord role may do on the site, chosen by the community's admins (page in step 4).
-- The "@everyone" role of a Discord server has the server's id. Permission names are a fixed list in
-- the code (server/access.mjs).
CREATE TABLE community_role_permissions (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  discord_role_id TEXT NOT NULL CHECK (discord_role_id NOT GLOB '*[^0-9]*' AND length(discord_role_id) BETWEEN 15 AND 22),
  permissions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (community_id, discord_role_id)
);

-- Invitation to the community's Discord server, offered to visitors who are not members yet.
ALTER TABLE communities ADD COLUMN discord_invite_url TEXT CHECK (discord_invite_url IS NULL OR discord_invite_url LIKE 'https://discord.gg/%' OR discord_invite_url LIKE 'https://discord.com/invite/%');
