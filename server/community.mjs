// The community of a request: every piece of data belongs to exactly one community, and every query is
// scoped to the community resolved here (the single entry point of the separation).
//
// On the platform (BASE_DOMAIN), the address says it: <slug>.endurance-manager.app. Elsewhere (main
// address, local preview, tests): the COMMUNITY variable (slug, "commu-dev" by default).
import {fail, communityLabel, baseDomain, origin} from './core.mjs';

export const DEFAULT_COMMUNITY_SLUG = 'commu-dev';

function parseJson(value) {
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}
function toCommunity(row) {
  return {id:row.id, slug:row.slug, name:row.name, shortName:row.short_name, discordGuildId:row.discord_guild_id || null,
    appearance:parseJson(row.appearance), modules:parseJson(row.modules), discordInviteUrl:row.discord_invite_url || null};
}

export function communitySlug(env, request) {
  const label = request ? communityLabel(new URL(request.url), env) : '';
  return label || String(env?.COMMUNITY || DEFAULT_COMMUNITY_SLUG).toLowerCase();
}
export async function currentCommunity(env, request) {
  const slug = communitySlug(env, request);
  const row = await env.DB.prepare('SELECT * FROM communities WHERE slug=?').bind(slug).first();
  if (!row) fail(404, 'Communauté introuvable.');
  return toCommunity(row);
}

export async function allCommunities(env) {
  return ((await env.DB.prepare('SELECT * FROM communities ORDER BY created_at, id').all()).results || []).map(toCommunity);
}

// Communities with a module enabled (scheduled tasks: iRacing import, weekly Discord recap).
export async function communitiesWith(env, module) {
  const rows = (await env.DB.prepare('SELECT * FROM communities ORDER BY created_at, id').all()).results || [];
  return rows.map(toCommunity).filter(community => community.modules[module] === true);
}

export const hasModule = (community, module) => community?.modules?.[module] === true;

// Address of the site of a community: <slug>.BASE_DOMAIN, or the main address for the community of the main
// address (COMMUNITY) and when there is a single site.
export function communityUrl(env, community) {
  const domain = baseDomain(env);
  if (!domain || community.slug === communitySlug(env, null)) return origin(env);
  return `https://${community.slug}.${domain}`;
}

// Look of a community: its accent color (set by its admins) and the icon and banner of its Discord
// server (kept by the settings page), as image addresses on Discord's CDN (allowed by the site's CSP).
export function appearanceOf(community) {
  const appearance = community.appearance || {}, guild = community.discordGuildId;
  const accent = /^#[0-9a-f]{6}$/i.test(appearance.accent || '') ? appearance.accent : null;
  const logoUrl = guild && appearance.discordIcon ? `https://cdn.discordapp.com/icons/${guild}/${appearance.discordIcon}.png?size=256` : null;
  const bannerUrl = guild && appearance.discordBanner ? `https://cdn.discordapp.com/banners/${guild}/${appearance.discordBanner}.png?size=2048` : null;
  return {accent, logoUrl, bannerUrl};
}
