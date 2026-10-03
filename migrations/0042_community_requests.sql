-- Requests for a new community, sent by the manager of a Discord server from the page « Demander un espace »
-- (demande.html). The platform managers read them in « Administration → Plateforme » and create the community
-- from them. The requester is the signed-in Discord account (users.id is the Discord id).
CREATE TABLE community_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  slug TEXT NOT NULL,
  discord_guild_id TEXT NOT NULL,
  discord_invite_url TEXT,
  games TEXT NOT NULL CHECK (games IN ('lmu','iracing','both')),
  members TEXT NOT NULL,
  contact TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','rejected')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_community_requests_status ON community_requests(status, created_at);
CREATE INDEX idx_community_requests_user ON community_requests(user_id);
