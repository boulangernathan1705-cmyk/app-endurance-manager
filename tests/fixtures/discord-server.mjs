// A test Discord server for commu-dev: the bot is not called in tests, the membership (roles) of each
// signed-in test player is written directly, as the bot would after checking the server.
export const GUILD = '900000000000000001';
export const ORGA_ROLE = '900000000000000002';
export const SAFE_ROLE = '900000000000000003';
export const DEV_COMMUNITY = 'e0a1c0de-0000-4000-8000-000000000001';
const ORGA_PERMISSIONS = ['endurance','crews','admin'];

export function linkTestServer(db, communityId = DEV_COMMUNITY) {
  db.prepare('UPDATE communities SET discord_guild_id=? WHERE id=?').run(GUILD, communityId);
  const set = db.prepare('INSERT OR REPLACE INTO community_role_permissions(community_id,discord_role_id,permissions,updated_at) VALUES(?,?,?,0)');
  set.run(communityId, GUILD, JSON.stringify(['access','endurance','solo_open']));
  set.run(communityId, ORGA_ROLE, JSON.stringify(ORGA_PERMISSIONS));
  set.run(communityId, SAFE_ROLE, JSON.stringify(['solo_safe']));
}
// « @everyone » may create crews too (since 2026-10-05 a pilot needs the « crews » permission for that).
export function allowCrews(db, communityId = DEV_COMMUNITY) {
  db.prepare('INSERT OR REPLACE INTO community_role_permissions(community_id,discord_role_id,permissions,updated_at) VALUES(?,?,?,0)')
    .run(communityId, GUILD, JSON.stringify(['access', 'endurance', 'solo_open', 'crews']));
}
// Member of the server with these roles (fresh check: the bot is not asked again for a day).
export function setMember(db, userId, roles = [], {communityId = DEV_COMMUNITY, status = 'member', admin = false} = {}) {
  const time = Math.floor(Date.now() / 1000);
  db.prepare(`INSERT INTO memberships(community_id,user_id,discord_roles,discord_admin,status,checked_at,created_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(community_id,user_id) DO UPDATE SET discord_roles=excluded.discord_roles,discord_admin=excluded.discord_admin,status=excluded.status,checked_at=excluded.checked_at`)
    .run(communityId, userId, JSON.stringify(roles), admin ? 1 : 0, status, time, time);
}
