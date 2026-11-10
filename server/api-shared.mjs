// Helpers the API files share: finding a race or a start, the acting community, a permission (server/worker.mjs, server/api-crews.mjs).
import {grindfestEnabled, isGrindfest} from '../shared/grindfest.mjs';
import {fail} from './core.mjs';
import {soloRacesEnabled, communityById} from './community.mjs';
import {isDevelopment} from './dev-environment.mjs';
import {communityAccess} from './access.mjs';
import {iracingSoloEnabled, importedIracingSolo} from './iracing-visibility.mjs';
// Official races (iRacing's official endurances, LMU official events): common to every community (migration 0039).
export const OFFICIAL = 'official';
// A race of the current community, or an official race: any id from another community answers "introuvable".
export async function eventById(env, eventId, community) {
  const row = await env.DB.prepare('SELECT * FROM events WHERE id=? AND (community_id=? OR community_id=?)').bind(eventId, community.id, OFFICIAL).first();
  // A solo race does not exist where solo races are off (production): no entry, edit or crew through its id.
  if (!row || (row.format === 'solo' && !soloRacesEnabled(env, community))) fail(404, 'Événement introuvable.');
  if (importedIracingSolo(row) && !iracingSoloEnabled(env,community)) fail(404, 'Événement introuvable.');
  if (isGrindfest(row) && !grindfestEnabled(community, isDevelopment(env))) fail(404, 'Événement introuvable.');
  return row;
}
// On an official race, a player acts for one of his communities (chosen at the first step of an entry or a crew;
// the one of an existing entry or crew), not only for the site's one: his membership and the rights of his
// Discord roles there are checked. Returns that community and the actor with his permissions in it.
export async function actingCommunity(env, actor, site, communityId, event = null) {
  if (importedIracingSolo(event) && !iracingSoloEnabled(env,site)) fail(404, 'Événement introuvable.');
  if (!communityId || communityId === site.id) return {community:site, actor};
  if (event && event.community_id !== OFFICIAL) fail(404, 'Événement introuvable.');
  const target = await communityById(env, communityId);
  if (!target) fail(404, 'Communauté introuvable.');
  if (importedIracingSolo(event) && !iracingSoloEnabled(env,target)) fail(404, 'Événement introuvable.');
  const access = await communityAccess(env, actor, target);
  if (access.status !== 'member') fail(403, `Tu n’es pas membre de la communauté ${target.name}.`);
  return {community:target, actor:{...actor, permissions:access.permissions, manager:access.manager}};
}
export function departureById(event, departureId) {
  const departure = JSON.parse(event.departures).find(d => d.id === departureId);
  if (!departure) fail(404, 'Départ introuvable.');
  return departure;
}
// An official slot for pilots leaving the common "Horaire à définir" start of the same race.
export function slotFor(event, from, departureId) {
  if (!from.tbd) fail(409, 'Ce départ a déjà son horaire.');
  const target = JSON.parse(event.departures).find(d => d.id === departureId);
  if (!target || target.tbd) fail(400, 'Choisis un des horaires proposés.');
  if (target.startsAt <= Date.now()) fail(409, 'Ce départ est passé.');
  return target;
}
// Permissions of the actor in the current community (server/access.mjs).
export const can = (actor, permission) => Boolean(actor.permissions?.has(permission));
