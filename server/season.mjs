import {requirePermission} from './access.mjs';
import {fail} from './core.mjs';
import {currentSeason,validSeason} from '../shared/season.mjs';

export async function communitySeason(env,community) {
  const row=await env.DB.prepare('SELECT start_month,version FROM community_seasons WHERE community_id=?').bind(community.id).first();
  return {start:row?.start_month||currentSeason(),version:row?.version||0};
}
export async function saveCommunitySeason(env,actor,community,input) {
  requirePermission(actor,'create_race','Seuls les organisateurs peuvent définir la saison.');
  if(!validSeason(input.start)||!Number.isSafeInteger(input.version)||input.version<0)fail(400,'Choisis un trimestre valide.');
  const query=input.version===0
    ? env.DB.prepare('INSERT INTO community_seasons(community_id,start_month,version) VALUES(?,?,1) ON CONFLICT(community_id) DO NOTHING').bind(community.id,input.start)
    : env.DB.prepare('UPDATE community_seasons SET start_month=?,version=version+1 WHERE community_id=? AND version=?').bind(input.start,community.id,input.version);
  const result=await query.run();
  if(!result.meta.changes)fail(409,'La saison a été modifiée par un autre organisateur. Actualise la page avant de réessayer.');
  return {start:input.start,version:input.version+1};
}
