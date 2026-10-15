import {tdzOnly} from '../shared/catalog.mjs';
import {isDevelopment} from './dev-environment.mjs';

export const iracingSoloEnabled=(env,community)=>community?.modules?.iracingImport===true&&community?.modules?.soloRaces===true&&!tdzOnly(community,isDevelopment(env));
export const importedIracingSolo=event=>event?.format==='solo'&&event?.community_id==='official'&&event?.created_by==='system:iracing';
// Shared by the calendar and Discord recaps. Prefixes are internal SQL aliases only.
export function iracingSoloSql(env,community,prefix=''){
  return iracingSoloEnabled(env,community)?'1':`NOT (${prefix}community_id='official' AND ${prefix}format='solo' AND ${prefix}created_by='system:iracing')`;
}
