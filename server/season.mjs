import {requirePermission} from './access.mjs';
import {fail} from './core.mjs';
import {defaultSeason, validStart, validMonths} from '../shared/season.mjs';

// The community's EVENT TDZ season: its first month and its length (shared/season.mjs).
export async function communitySeason(env, community) {
  const row = await env.DB.prepare('SELECT start_month,months,version FROM community_seasons WHERE community_id=?').bind(community.id).first();
  return row ? {start:row.start_month, months:Number(row.months) || 3, version:row.version} : {...defaultSeason(), version:0};
}
export async function saveCommunitySeason(env, actor, community, input) {
  requirePermission(actor, 'create_race', 'Seuls les organisateurs peuvent régler la saison.');
  if (!validStart(input?.start) || !validMonths(input?.months) || !Number.isSafeInteger(input?.version) || input.version < 0) fail(400, 'Choisis un mois de début et une durée de 1 à 12 mois.');
  const result = await (input.version === 0
    ? env.DB.prepare('INSERT INTO community_seasons(community_id,start_month,months,version) VALUES(?,?,?,1) ON CONFLICT(community_id) DO NOTHING').bind(community.id, input.start, input.months)
    : env.DB.prepare('UPDATE community_seasons SET start_month=?,months=?,version=version+1 WHERE community_id=? AND version=?').bind(input.start, input.months, community.id, input.version)).run();
  if (!result.meta.changes) fail(409, 'La saison vient d’être modifiée par un autre organisateur. Actualise la page.');
  return {start:input.start, months:input.months, version:input.version + 1};
}
