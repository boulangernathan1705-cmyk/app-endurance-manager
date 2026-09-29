// Access to a community: only the members of its Discord server, with what their Discord roles allow.
//
// - The platform managers (ADMIN_DISCORD_IDS) have every permission everywhere.
// - A member's permissions = the permissions of all their Discord roles (community_role_permissions),
//   "@everyone" included (its role id is the server id). Without any setting for "@everyone", members may
//   enter races and create their crew.
// - The owner of the server and any role with Discord's "Administrator" permission have every permission.
// - Membership and roles are checked by the bot (DISCORD_BOT_TOKEN) when the player comes, at most once a
//   day, and by the daily task. The player's other servers are never looked at.
// - No Discord server set for the community, or the bot cannot tell: no access (fail closed).
import {administrators, fail, now} from './core.mjs';

export const PERMISSIONS = Object.freeze([
  'endurance',            // s'inscrire aux endurances, rejoindre, créer et gérer son équipage
  'solo_open',            // s'inscrire aux courses solo OPEN (module courses solo)
  'solo_safe',            // s'inscrire aux courses solo SAFE et OPEN (module courses solo)
  'manage_registrations', // inscrire, modifier, retirer n'importe quel pilote ; composer tous les équipages
  'create_race',          // créer des courses, modifier et supprimer les siennes
  'manage_races',         // modifier et supprimer toutes les courses
  'admin'                 // page Membres et réglages de la communauté
]);
export const DEFAULT_EVERYONE = Object.freeze(['endurance', 'solo_open']);
const ORGANIZER = Object.freeze([...DEFAULT_EVERYONE, 'manage_registrations', 'create_race', 'manage_races']);
// Names used before the permissions were redefined (settings saved with them keep their meaning).
const LEGACY = {register:['endurance', 'solo_open'], create_crew:['endurance'], register_others:['manage_registrations'],
  manage_crews:['manage_registrations'], safe_races:['solo_safe']};
export const normalizePermissions = list => [...new Set((list || []).flatMap(permission => LEGACY[permission] || [permission]))]
  .filter(permission => PERMISSIONS.includes(permission));

const DISCORD_API = 'https://discord.com/api/v10';
const CHECK_EVERY = 24 * 3600; // seconds
const ADMINISTRATOR = 0x8n;

async function bot(env, path) {
  const tokenValue = String(env?.DISCORD_BOT_TOKEN || '').trim();
  if (!tokenValue) return {ok:false, status:0};
  const response = await fetch(`${DISCORD_API}${path}`, {headers:{Authorization:`Bot ${tokenValue}`}, signal:AbortSignal.timeout(8000)});
  return {ok:response.ok, status:response.status, data:response.ok ? await response.json() : null};
}

// Server details (owner, roles with their Discord permissions), kept a few minutes per Worker instance.
const guildCache = new Map();
async function guild(env, guildId) {
  const cached = guildCache.get(guildId);
  if (cached && cached.until > Date.now()) return cached.value;
  const [info, roles] = await Promise.all([bot(env, `/guilds/${guildId}`), bot(env, `/guilds/${guildId}/roles`)]);
  if (!info.ok || !roles.ok) return null;
  const value = {ownerId:String(info.data.owner_id || ''), name:String(info.data.name || ''),
    icon:/^(a_)?[a-f0-9]{32}$/.test(info.data.icon || '') ? info.data.icon : '', banner:/^(a_)?[a-f0-9]{32}$/.test(info.data.banner || '') ? info.data.banner : '',
    roles:(roles.data || []).map(role => ({id:String(role.id), name:String(role.name), position:Number(role.position) || 0,
      administrator:(BigInt(role.permissions || '0') & ADMINISTRATOR) === ADMINISTRATOR}))};
  guildCache.set(guildId, {value, until:Date.now() + 5 * 60_000});
  return value;
}
export const discordGuild = guild;

// Asks Discord (bot) whether the player is on the server and with which roles; stores the answer.
// Returns the membership row, or null when Discord could not answer (the previous row is kept).
export async function checkMembership(env, community, userId) {
  const guildId = community.discordGuildId;
  if (!guildId) return null;
  const member = await bot(env, `/guilds/${guildId}/members/${userId}`);
  const time = now();
  if (member.status === 404) {
    await env.DB.prepare(`INSERT INTO memberships(community_id,user_id,status,checked_at,created_at) VALUES(?,?,'left',?,?)
      ON CONFLICT(community_id,user_id) DO UPDATE SET status='left',discord_roles='[]',discord_admin=0,checked_at=excluded.checked_at`)
      .bind(community.id, userId, time, time).run();
    return {status:'left', discord_roles:'[]', discord_admin:0, checked_at:time};
  }
  if (!member.ok) return null;
  const details = await guild(env, guildId);
  const roles = (member.data?.roles || []).map(String);
  const adminRoles = new Set((details?.roles || []).filter(role => role.administrator).map(role => role.id));
  const discordAdmin = details?.ownerId === userId || roles.some(role => adminRoles.has(role)) ? 1 : 0;
  const nickname = String(member.data?.nick || '').slice(0, 64);
  await env.DB.prepare(`INSERT INTO memberships(community_id,user_id,discord_roles,nickname,discord_admin,status,checked_at,created_at)
      VALUES(?,?,?,?,?,'member',?,?)
      ON CONFLICT(community_id,user_id) DO UPDATE SET discord_roles=excluded.discord_roles,nickname=excluded.nickname,
        discord_admin=excluded.discord_admin,status='member',checked_at=excluded.checked_at`)
    .bind(community.id, userId, JSON.stringify(roles), nickname, discordAdmin, time, time).run();
  return {status:'member', discord_roles:JSON.stringify(roles), discord_admin:discordAdmin, checked_at:time};
}

async function rolePermissions(env, community, roles) {
  const everyone = community.discordGuildId;
  const rows = (await env.DB.prepare('SELECT discord_role_id, permissions FROM community_role_permissions WHERE community_id=?').bind(community.id).all()).results || [];
  const byRole = new Map(rows.map(row => [row.discord_role_id, normalizePermissions(JSON.parse(row.permissions || '[]'))]));
  const granted = new Set(byRole.has(everyone) ? byRole.get(everyone) : DEFAULT_EVERYONE);
  for (const role of roles) for (const permission of byRole.get(role) || []) granted.add(permission);
  return new Set([...granted].filter(permission => PERMISSIONS.includes(permission)));
}

// Permissions of a stored membership (members page).
export async function memberPermissions(env, community, membership) {
  if (membership.discord_admin) return new Set(PERMISSIONS);
  return rolePermissions(env, community, JSON.parse(membership.discord_roles || '[]'));
}

// Access of the actor to the community: {status, permissions, manager}.
//   status: 'member' (access), 'anonymous' (not signed in), 'not-member' (not on the Discord server),
//   'unavailable' (the server or the bot cannot be checked).
export async function communityAccess(env, actor, community, {open = false} = {}) {
  const none = status => ({status, permissions:new Set(), manager:false});
  if (!actor.user) return none('anonymous');
  const manager = administrators(env).includes(actor.user.id);
  // Open site (main address): every signed-in player enters; the organizers keep their role of the site.
  if (open) {
    if (manager) return {status:'member', permissions:new Set(PERMISSIONS), manager};
    const row = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(actor.user.id).first();
    return {status:'member', permissions:new Set(row?.role === 'organizer' ? ORGANIZER : DEFAULT_EVERYONE), manager:false};
  }
  if (!community.discordGuildId) return manager ? {status:'member', permissions:new Set(PERMISSIONS), manager} : none('unavailable');
  let membership = await env.DB.prepare('SELECT * FROM memberships WHERE community_id=? AND user_id=?').bind(community.id, actor.user.id).first();
  // Managers are checked too (to appear on the members page when they are on the server), but their access never depends on it.
  if (!membership || membership.checked_at < now() - CHECK_EVERY) membership = (await checkMembership(env, community, actor.user.id).catch(error => { if (!manager) throw error; return null; })) || membership;
  if (manager) return {status:'member', permissions:new Set(PERMISSIONS), manager};
  if (!membership) return none('unavailable');
  if (membership.status !== 'member') return none('not-member');
  if (membership.discord_admin) return {status:'member', permissions:new Set(PERMISSIONS), manager:false};
  return {status:'member', permissions:await rolePermissions(env, community, JSON.parse(membership.discord_roles || '[]')), manager:false};
}

export function requirePermission(actor, permission, message = 'Tu n’as pas l’autorisation de faire cette action dans cette communauté.') {
  if (!actor.user) fail(401, 'Connecte-toi avec Discord.');
  if (!actor.permissions?.has(permission)) fail(403, message);
}

// Role shown on the site (account menu), from the permissions in this community.
export function displayRole(access) {
  if (access.permissions.has('admin')) return 'admin';
  if (access.permissions.has('manage_races') || access.permissions.has('create_race')) return 'organizer';
  return 'pilot';
}

// Daily task: memberships not checked for a day are checked again (a few at a time).
export async function refreshMemberships(env, communities, limit = 40) {
  const byId = new Map(communities.filter(community => community.discordGuildId).map(community => [community.id, community]));
  if (!byId.size) return 0;
  const rows = (await env.DB.prepare(`SELECT community_id, user_id FROM memberships WHERE status='member' AND checked_at < ? ORDER BY checked_at LIMIT ?`)
    .bind(now() - CHECK_EVERY, limit).all()).results || [];
  let checked = 0;
  for (const row of rows) {
    const community = byId.get(row.community_id);
    if (community && await checkMembership(env, community, row.user_id)) checked++;
  }
  return checked;
}
