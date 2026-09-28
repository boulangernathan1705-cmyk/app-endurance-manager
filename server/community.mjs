// The community of a request: every piece of data belongs to exactly one community, and every query is
// scoped to the community resolved here (the single entry point of the separation).
//
// Step 1: one community per site, set by the COMMUNITY variable (slug, "commu-dev" by default).
// Step 3 will read it from the address (<slug>.endurance-manager.app).
import {fail} from './core.mjs';

export const DEFAULT_COMMUNITY_SLUG = 'commu-dev';

function parseJson(value) {
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}
function toCommunity(row) {
  return {id:row.id, slug:row.slug, name:row.name, shortName:row.short_name, discordGuildId:row.discord_guild_id || null,
    appearance:parseJson(row.appearance), modules:parseJson(row.modules)};
}

export async function currentCommunity(env) {
  const slug = String(env?.COMMUNITY || DEFAULT_COMMUNITY_SLUG).toLowerCase();
  const row = await env.DB.prepare('SELECT * FROM communities WHERE slug=?').bind(slug).first();
  if (!row) fail(404, 'Communauté introuvable.');
  return toCommunity(row);
}

// Communities with a module enabled (scheduled tasks: iRacing import, weekly Discord recap).
export async function communitiesWith(env, module) {
  const rows = (await env.DB.prepare('SELECT * FROM communities ORDER BY created_at, id').all()).results || [];
  return rows.map(toCommunity).filter(community => community.modules[module] === true);
}

export const hasModule = (community, module) => community?.modules?.[module] === true;
