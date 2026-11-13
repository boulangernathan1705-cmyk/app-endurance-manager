import {communitySeason} from './season.mjs';
import {grindfestAvailable, grindfestEnabled, isGrindfest, streamersOf, assignStreamerWaitlist} from '../shared/grindfest.mjs';
import {discordInteraction} from './discord-interactions.mjs';
import {announceStream} from './discord-announce.mjs';
import {gridfestPasswordStatus, sendGridfestPasswords} from './gridfest-discord.mjs';
import {
  LEGACY_CAR_ALIASES, DAY, HttpError, fail, now, id, token, hash, cookie, SESSION_DAYS, setCookie, cookieNames, siteOrigin, communityLabel,
  baseDomain, json, jsonText, redirect, origin, requireDiscord, administrators, identity, owned, personal, registrationSelect,
  registrationParticipant, NAME_IN_COMMUNITY, communityName, body, rateLimit, cleanup, returnPath, validateEvent, validateRegistration
} from './core.mjs';
import {ingestClientError, clientErrorsApi} from './telemetry.mjs';
import {communityRequestsApi} from './community-requests.mjs';
import {racesPath} from './races-path.mjs';
import {eventListTag, matchesEventTag} from './event-revision.mjs';
import {measureRequest} from './request-metrics.mjs';
import {simForEvent, TDZ_EVENT_TYPES, normalizeTdzDetails, tdzOnly, eventsLabel} from '../shared/catalog.mjs';
import {
  soloRacesEnabled, currentCommunity, appearanceOf, allCommunities, communityUrl, communitySlug, communityById, communityFromRow
} from './community.mjs';
import {isDevelopment} from './dev-environment.mjs';
import {STREAM_SIM} from '../shared/stream.mjs';
import {streamCrews} from './stream-crew.mjs';
import {communityAccess, requirePermission, displayRole, ALL_PERMISSIONS, memberPermissions, discoverMemberships, crewOrganisers} from './access.mjs';
// Solo races: a module each community turns on or off (settings of the members page).
import {iracingSoloEnabled, iracingSoloSql} from './iracing-visibility.mjs';
import {communityApi} from './api-community.mjs';
import {platformApi} from './api-platform.mjs';
import {crewsApi, canManageCrew} from './api-crews.mjs';
import {OFFICIAL, eventById, actingCommunity, departureById, slotFor, can} from './api-shared.mjs';
// « EVENT SOLO » (every community but the TDZ): no type, no SAFE access.
const plainSoloInput = (env, community, input) => {
  if (input?.format !== 'solo' || tdzOnly(community, isDevelopment(env))) return input;
  const details = input.details && typeof input.details === 'object' ? {...input.details} : {};
  delete details.type;
  return {...input, access:'open', details};
};
import {combosApi, combosPlugin, combosEnabled} from './combos.mjs';


import {botRecapSettings} from './recap-discord.mjs';
import {parseLayout} from './discord-layout.mjs';
import {notify, notificationsApi, departurePilots, eventPilots, crewPilots} from './notifications.mjs';
// Real starts were added next to the common "Horaire à définir" start: nobody is on it (no entry, no
// crew), so it is not needed any more and is left out.
async function dropEmptyCommonStart(env, eventId, data) {
  const common = data.departures.find(departure => departure.tbd);
  if (!common || data.departures.length < 2) return;
  const used = eventId && await env.DB.prepare('SELECT 1 FROM registrations WHERE event_id=? AND departure_id=? UNION SELECT 1 FROM crews WHERE event_id=? AND departure_id=? LIMIT 1')
    .bind(eventId, common.id, eventId, common.id).first();
  if (!used) data.departures = data.departures.filter(departure => departure !== common);
}
// Real starts removed from a race while pilots are on them: their entries and crews go to the waiting start
// ("Horaire à définir", added when missing), where each pilot or crew picks a time again. A pilot still entered
// on another start keeps that one (the removed entry goes); a pilot can wait only once per category.
async function waitingMoves(env, event, data) {
  const kept = new Set(data.departures.map(d => d.id));
  const removed = JSON.parse(event.departures || '[]').filter(d => !d.tbd && !kept.has(d.id));
  if (!removed.length) return null;
  const all = async (sql, ...params) => (await env.DB.prepare(sql).bind(...params).all()).results || [];
  const gone = JSON.stringify(removed.map(d => d.id));
  const regs = await all(`SELECT r.id, r.departure_id, r.participant_id, r.category, cm.crew_id FROM registrations r
    LEFT JOIN crew_members cm ON cm.registration_id=r.id WHERE r.event_id=? AND r.departure_id IN (SELECT value FROM json_each(?))`, event.id, gone);
  const crews = await all('SELECT id FROM crews WHERE event_id=? AND departure_id IN (SELECT value FROM json_each(?))', event.id, gone);
  if (!regs.length && !crews.length) return null;
  let waiting = data.departures.find(d => d.tbd), added = null;
  if (!waiting) {
    const first = [...data.departures, ...removed].sort((a, b) => a.startsAt - b.startsAt)[0];
    waiting = added = {id:id(), date:first.date, time:first.time, startsAt:first.startsAt, tbd:true};
    data.departures.unshift(added);
  }
  const others = await all(`SELECT r.id, r.departure_id, r.participant_id, r.category, cm.crew_id FROM registrations r
    LEFT JOIN crew_members cm ON cm.registration_id=r.id WHERE r.event_id=? AND r.departure_id NOT IN (SELECT value FROM json_each(?))`, event.id, gone);
  const key = reg => `${reg.participant_id}|${reg.category}`;
  const waitingByKey = new Map(others.filter(reg => reg.departure_id === waiting.id).map(reg => [key(reg), reg]));
  const elsewhere = new Set(others.filter(reg => reg.departure_id !== waiting.id && kept.has(reg.departure_id)).map(reg => reg.participant_id));
  const move = [], drop = [], taken = new Set(waitingByKey.keys());
  // Crew members first: their crew needs them. A plain waiting entry of the same pilot makes way.
  for (const reg of regs.filter(item => item.crew_id)) {
    const before = waitingByKey.get(key(reg));
    if (!taken.has(key(reg))) { taken.add(key(reg)); move.push(reg); }
    else if (before && !before.crew_id && !drop.includes(before.id)) { drop.push(before.id); move.push(reg); }
    else drop.push(reg.id);
  }
  for (const reg of regs.filter(item => !item.crew_id)) {
    if (taken.has(key(reg)) || elsewhere.has(reg.participant_id)) drop.push(reg.id);
    else { taken.add(key(reg)); move.push(reg); }
  }
  const members = move.filter(reg => reg.crew_id), crewIds = JSON.stringify(crews.map(crew => crew.id));
  const list = items => JSON.stringify(items);
  return {statements:version => {
    const same = 'EXISTS(SELECT 1 FROM events WHERE id=? AND version=?)', at = [event.id, version];
    return [
      ...(added ? [env.DB.prepare("UPDATE events SET departures=json_insert(departures,'$[#]',json(?)) WHERE id=? AND version=?").bind(JSON.stringify(added), ...at)] : []),
      env.DB.prepare(`DELETE FROM crew_members WHERE crew_id IN (SELECT value FROM json_each(?)) AND ${same}`).bind(crewIds, ...at),
      env.DB.prepare(`DELETE FROM registrations WHERE id IN (SELECT value FROM json_each(?)) AND ${same}`).bind(list(drop), ...at),
      env.DB.prepare(`UPDATE registrations SET departure_id=?,version=version+1 WHERE id IN (SELECT value FROM json_each(?)) AND ${same}`).bind(waiting.id, list(move.map(reg => reg.id)), ...at),
      env.DB.prepare(`UPDATE crews SET departure_id=?,version=version+1 WHERE id IN (SELECT value FROM json_each(?)) AND ${same}`).bind(waiting.id, crewIds, ...at),
      ...members.map(reg => env.DB.prepare(`INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE ${same}`).bind(reg.id, reg.crew_id, ...at))
    ];
  }};
}
// Pilots on the waiting start, once real times exist: a crew's manager picks its time, its pilots are told,
// a pilot without a crew picks his own. Returns the players told.
async function askToChooseStart(env, event, waitingId) {
  const all = async (sql, ...params) => (await env.DB.prepare(sql).bind(...params).all()).results || [];
  const crews = await all('SELECT id, name, owner_user_id, community_id FROM crews WHERE event_id=? AND departure_id=?', event.id, waitingId);
  const told = [], organisers = new Map();
  for (const crew of crews) {
    // Without a manager (made by an organiser for others), the organisers of its community choose.
    if (!crew.owner_user_id && !organisers.has(crew.community_id)) {
      const home = await communityById(env, crew.community_id).catch(() => null);
      organisers.set(crew.community_id, home ? (await crewOrganisers(env, home)).map(row => ({user_id:row.user_id, community_id:crew.community_id})) : []);
    }
    const manager = crew.owner_user_id ? [{user_id:crew.owner_user_id, community_id:crew.community_id}] : organisers.get(crew.community_id);
    await notify(env, manager, 'choose_departure', event, {crewName:crew.name, manage:true});
    await notify(env, await crewPilots(env, crew.id), 'choose_departure', event, {crewName:crew.name, skip:[crew.owner_user_id]});
    told.push(...(await crewPilots(env, crew.id)).map(row => row.user_id));
  }
  const alone = await all(`SELECT DISTINCT p.user_id, r.community_id FROM registrations r JOIN participants p ON p.id=r.participant_id
    WHERE r.event_id=? AND r.departure_id=? AND r.status!='unavailable' AND p.user_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM crew_members cm WHERE cm.registration_id=r.id)`, event.id, waitingId);
  await notify(env, alone, 'choose_departure', event, {skip:told});
  return [...told, ...alone.map(row => row.user_id)];
}
// "Mes communautés": the communities where the player is a member (managers: all of them), with the address of
// each site. A feature of the platform (not a community module): empty unless the player has several communities.
async function myCommunities(env, actor, community, all = false) {
  const domain = baseDomain(env);
  if (!domain || !actor.user) return [];
  const list = actor.manager ? await allCommunities(env)
    : ((await env.DB.prepare(`SELECT c.* FROM communities c JOIN memberships m ON m.community_id=c.id WHERE m.user_id=? AND m.status='member' ORDER BY c.id`)
      .bind(actor.user.id).all()).results || []).map(communityFromRow);
  // The showcase (community of the main address, when that address is the platform's domain) is never one of them.
  const showcase = (() => { try { return new URL(env.APP_ORIGIN).hostname === domain ? communitySlug(env, null) : ''; } catch { return ''; } })();
  const mine = list.filter(item => item.slug !== showcase || item.discordGuildId).sort((x, y) => x.name.localeCompare(y.name, 'fr')).map(item => ({id:item.id, slug:item.slug, name:item.name, shortName:item.shortName,
    logoUrl:appearanceOf(item).logoUrl, accent:appearanceOf(item).accent, url:`${communityUrl(env, item)}/`, current:item.slug === community.slug, item}));
  // "Gérer tous les équipages" in each (a crew of an official race is created for any of them, whatever the site).
  const memberships = actor.manager ? [] : (await env.DB.prepare("SELECT * FROM memberships WHERE user_id=? AND status='member'").bind(actor.user.id).all()).results || [];
  const allowed = [];
  for (const entry of mine) {
    const membership = memberships.find(row => row.community_id === entry.id);
    const permissions = actor.manager ? new Set(ALL_PERMISSIONS) : membership ? await memberPermissions(env, entry.item, membership) : new Set();
    if (!permissions.has('access')) continue;
    entry.iracingSolo = iracingSoloEnabled(env,entry.item);
    entry.manageCrews = permissions.has('crews');
    delete entry.item;
    allowed.push(entry);
  }
  // all: every one (a visitor without access here is shown where he can go).
  return all || allowed.length >= 2 ? allowed : [];
}
// « Je streame ce départ »: {stream:{start:'20:00', end:'23:00'}} or {stream:null}. An end before the start is the next
// morning until 6h, otherwise a mistake.
function registrationStream(input) {
  const raw = input?.stream, clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!raw) return {time:'', end:''};
  if (!clock.test(raw.start || '') || (raw.end && !clock.test(raw.end))) fail(400, 'Heures du stream invalides.');
  if (raw.end && (raw.end === raw.start || (raw.end < raw.start && raw.end > '06:00'))) fail(400, 'La fin du stream doit être après son début.');
  return {time:raw.start, end:raw.end || ''};
}
// « Je streame ce départ »: an admin, or the community's streamer (his name here = « Nom du streamer » of Admin › Discord).
async function mayStream(env, who, community, actor) {
  if (can(who, 'admin')) return true;
  const streamer = String(parseLayout((await botRecapSettings(env, community).catch(() => null))?.layout)?.streamName || '').trim().toLowerCase();
  if (!streamer || !actor.user) return false;
  const name = await communityName(env, actor.user.id, community.id) || actor.user.name;
  return String(name || '').trim().toLowerCase() === streamer;
}
function isRegistrationManager(actor) {
  return can(actor, 'manage_registrations');
}
function canManageRegistration(reg, actor) {
  return owned(reg, actor) || isRegistrationManager(actor);
}
function publicRegistration(reg, actor, userNames = new Map(), community = null, names = new Map(), perms = new Map(), official = new Set(), pilotNames = new Map()) {
  let cars = [];
  try { cars = JSON.parse(reg.car_preferences || '[]'); } catch {}
  if (!Array.isArray(cars) || !cars.length) cars = reg.car ? [reg.car] : [];
  cars = cars.map(car => LEGACY_CAR_ALIASES.get(car) || car);
  const participantUserId = reg.participant_user_id || reg.user_id || '';
  const foreign = Boolean(community && reg.community_id && reg.community_id !== community.id);
  const creatorId = reg.owner_user_id || '';
  // Only names from communities accessible to the reader are available here.
  // Prefer the site being read, then the entry's community, then a stable common community.
  const knownNames = pilotNames.get(participantUserId) || [];
  const primary = knownNames.find(item => item.communityId === community?.id)
    || knownNames.find(item => item.communityId === reg.community_id) || knownNames[0];
  const displayName = primary?.name || reg.participant_global_name || reg.participant_name || reg.name;
  const otherNames = knownNames.filter(item => item.name !== displayName);
  const createdForOther = Boolean(creatorId && creatorId !== participantUserId);
  const canSeeCreator = createdForOther && Boolean(actor.user) && (
    actor.user.id === creatorId || actor.user.id === participantUserId || isRegistrationManager(actor)
  );
  return {
    id:reg.id,
    participantId:reg.participant_id,
    name:displayName,
    ...(otherNames.length ? {otherNames} : {}),
    category:reg.category,
    car:cars[0] || reg.car || '',
    cars,
    carAny:Boolean(reg.car_any),
    roundChoices:JSON.parse(reg.round_choices||'[]'),
    streamerId:reg.streamer_id || null,
    ...(reg.streamer_id ? {gameName:reg.game_name || ''} : {}),
    status:reg.status,
    preferredPilot:reg.preferred_pilot || '',
    comment:reg.comment || '',
    // A stream is told on its community's site only (its link is that community's).
    ...(reg.stream_time && !foreign && (!community || reg.community_id === community.id) ? {streamTime:reg.stream_time, streamEnd:reg.stream_end || ''} : {}),
    soloDriver:Boolean(reg.solo_driver),
    version:reg.version,
    discordLinked:Boolean(reg.participant_user_id),
    mine:personal(reg, actor),
    managed:owned(reg,actor)&&!personal(reg,actor),
    canEdit:foreign ? perms.has(reg.community_id) && canManageRegistration(reg, {...actor, permissions:perms.get(reg.community_id)}) : canManageRegistration(reg, actor),
    ...(foreign ? {foreign:true} : {}),
    ...(official.has(reg.event_id) ? {community:names.get(reg.community_id) || null} : {}),
    addedByName:canSeeCreator ? (userNames.get(creatorId) || '') : ''
  };
}
// Archived = every start is in the past (same rule as front/schedule.mjs). "upcoming" keeps a
// one-day margin so a race that just started stays visible, and undated races stay upcoming.
// last_start (the latest departure's start, the far future when undated; kept by triggers, migrations 0057-0058)
// is indexed: only the races asked for are read.
function eventScopeFilter(scope, nowMs=Date.now()) {
  const cutoff=Math.floor(nowMs);
  if (scope==='upcoming') return `e.last_start>${cutoff-86400000}`;
  if (scope==='archived') return `e.last_start<=${cutoff}`;
  return '';
}
async function listEvents(env, actor, game='', scope='', community, at=Date.now()) {
  // Bound in order: the site's community (filters), then the site's community and the player (mine). The races of the community and the official races (iRacing's ones
  // where the community shows the iRacing calendar); on an official race, the entries and crews of every
  // community the player is a member of, never of the others.
  const officialRaces = community.modules?.iracingImport === true ? "e.community_id='official'" : "(e.community_id='official' AND e.circuit NOT LIKE 'iracing-%')";
  const filters=[`(e.community_id=? OR ${officialRaces})`, iracingSoloSql(env,community,'e.'),game==='iracing' ? "(e.format='solo' OR e.circuit LIKE 'iracing-%')" : game==='lmu' ? "(e.format='solo' OR e.circuit NOT LIKE 'iracing-%')" : '', eventScopeFilter(scope, at), soloRacesEnabled(env, community) ? '' : "COALESCE(e.format,'endurance')!='solo'", grindfestEnabled(community, isDevelopment(env)) ? '' : "COALESCE(json_extract(e.details,'$.type'),'') NOT IN ('Gridfest','Grindfest')"].filter(Boolean);
  const where=filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
  const player = actor.user?.id || '';
  const rows = (await env.DB.prepare(`SELECT e.* FROM events e${where} ORDER BY e.created_at DESC, e.id DESC`).bind(community.id).all()).results;
  if (!rows.length) return [];
  // Discord membership alone must not expose another community's crews after site access is withdrawn.
  const otherPermissions = new Map();
  if (player) {
    const memberships = (await env.DB.prepare(`SELECT c.*,m.discord_roles,m.discord_admin FROM communities c JOIN memberships m ON m.community_id=c.id WHERE m.user_id=? AND m.status='member'`).bind(player).all()).results || [];
    for (const membership of memberships) {
      const permissions = actor.manager ? new Set(ALL_PERMISSIONS) : await memberPermissions(env, communityFromRow(membership), membership);
      if (permissions.has('access')) otherPermissions.set(membership.id, permissions);
    }
  }
  const accessible = JSON.stringify([...otherPermissions.keys()]);
  const mine = column => `${column} IN (SELECT ? UNION SELECT value FROM json_each(?))`;
  // The entries, crews and names of these races only, by race id (the events index, not the history), all at once:
  // one wait for the database instead of one per query. By packs of 90 races (D1 takes at most 100 bound values).
  const packs = [];
  for (let start = 0; start < rows.length; start += 90) packs.push(rows.slice(start, start + 90).map(row => row.id));
  const inPack = ids => ids.map(() => '?').join(',');
  const byPacks = (sql, extra) => Promise.all(packs.map(ids => env.DB.prepare(sql(inPack(ids))).bind(...ids, ...extra).all()))
    .then(parts => parts.flatMap(part => part.results || []));
  const [registrations, crews, memberships, users, absenceRows] = await Promise.all([
    byPacks(ids => registrationSelect+` WHERE r.event_id IN (${ids}) AND ${mine('r.community_id')} ORDER BY COALESCE(r.streamer_order,r.created_at),r.rowid`, [community.id, accessible]),
    byPacks(ids => `SELECT c.* FROM crews c WHERE c.event_id IN (${ids}) AND ${mine('c.community_id')} ORDER BY c.created_at,c.id`, [community.id, accessible]),
    byPacks(ids => `SELECT cm.crew_id,cm.registration_id FROM crew_members cm JOIN crews c ON c.id=cm.crew_id WHERE c.event_id IN (${ids}) AND ${mine('c.community_id')}`, [community.id, accessible]),
    // Only registration creators' names are displayed (addedByName).
    byPacks(ids => `SELECT DISTINCT u.id,${NAME_IN_COMMUNITY.replace('?', 'r.community_id')} AS name FROM users u JOIN registrations r ON r.owner_user_id=u.id WHERE r.event_id IN (${ids}) AND ${mine('r.community_id')}`, [community.id, accessible]),
    // « Je serai absent »: the pilots of the site's community who said they will miss the event.
    byPacks(ids => `SELECT a.event_id,a.user_id,${NAME_IN_COMMUNITY.replace('?', 'a.community_id')} AS name FROM event_absences a JOIN users u ON u.id=a.user_id WHERE a.event_id IN (${ids}) AND a.community_id=? ORDER BY a.created_at`, [community.id])
  ]);
  // On official races, every entry and crew shows its community (Discord logo or short name, colour); in the
  // player's other communities, the rights of his Discord roles there apply.
  const official = new Set(rows.filter(row => row.community_id === OFFICIAL).map(row => row.id));
  const names = new Map(), perms = new Map();
  if (official.size) {
    const shown = new Set([...registrations.filter(reg => official.has(reg.event_id)).map(reg => reg.community_id), ...crews.filter(crew => official.has(crew.event_id)).map(crew => crew.community_id)]);
    for (const row of (await env.DB.prepare(`SELECT * FROM communities WHERE ${mine('id')}`).bind(community.id, accessible).all()).results || []) {
      if (!shown.has(row.id)) continue;
      const item = communityFromRow(row), look = appearanceOf(item);
      names.set(row.id, {id:row.id, name:item.name, shortName:item.shortName, accent:look.accent, logoUrl:look.logoUrl});
      if (row.id === community.id || !actor.user) continue;
      if (otherPermissions.has(row.id)) perms.set(row.id, otherPermissions.get(row.id));
    }
  }
  const userNames = new Map(users.map(item => [item.id,item.name]));
  // Batch the pilots' identities, never one Discord/API/database request per inscription.
  // The access filter also prevents leaking nicknames from another community.
  const pilotNames = new Map();
  const pilotIds = [...new Set(registrations.map(reg => reg.participant_user_id).filter(Boolean))];
  for (let offset = 0; offset < pilotIds.length; offset += 90) {
    const ids = pilotIds.slice(offset, offset + 90);
    const identities = (await env.DB.prepare(`SELECT m.user_id, m.community_id AS communityId,
      c.name AS communityName, COALESCE(NULLIF(m.nickname,''),u.name) AS name
      FROM memberships m JOIN users u ON u.id=m.user_id JOIN communities c ON c.id=m.community_id
      WHERE m.user_id IN (${inPack(ids)}) AND m.status='member' AND ${mine('m.community_id')}
      ORDER BY c.slug,m.community_id`).bind(...ids,community.id,accessible).all()).results || [];
    for (const identity of identities) {
      if (!pilotNames.has(identity.user_id)) pilotNames.set(identity.user_id, []);
      pilotNames.get(identity.user_id).push({communityId:identity.communityId, communityName:identity.communityName, name:identity.name});
    }
  }
  const absences = new Map();
  for (const item of absenceRows) {
    if (!absences.has(item.event_id)) absences.set(item.event_id, []);
    absences.get(item.event_id).push({name:item.name, mine:item.user_id === player});
  }
  const grouped = new Map();
  for (const reg of registrations) { const key = `${reg.event_id}:${reg.departure_id}`; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(publicRegistration(reg, actor, userNames, community, names, perms, official, pilotNames)); }
  const membersByCrew = new Map();
  for (const member of memberships) {
    if (!membersByCrew.has(member.crew_id)) membersByCrew.set(member.crew_id, []);
    membersByCrew.get(member.crew_id).push(member.registration_id);
  }
  const crewsByDeparture = new Map();
  for (const crew of crews) {
    const key = `${crew.event_id}:${crew.departure_id}`;
    if (!crewsByDeparture.has(key)) crewsByDeparture.set(key, []);
    crewsByDeparture.get(key).push({
      id:crew.id,
      name:crew.name,
      category:crew.category,
      car:crew.car,
      locked:Boolean(crew.locked),
      version:crew.version,
      registrationIds:membersByCrew.get(crew.id) || [],
      canManage:crew.community_id===community.id ? canManageCrew(crew,actor) : perms.has(crew.community_id) && canManageCrew(crew,{...actor, permissions:perms.get(crew.community_id)}),
      ownedByMe:Boolean(actor.user && crew.owner_user_id===actor.user.id),
      hasOwner:Boolean(crew.owner_user_id),
      ...(crew.community_id!==community.id ? {foreign:true} : {}),
      ...(official.has(crew.event_id) ? {community:names.get(crew.community_id) || null} : {})
    });
  }
  const crewsOfStreams = await streamCrews(env, community.id, rows);
  return rows.map(row => {
    const format=row.format||'endurance', capacity=row.capacity==null?null:Number(row.capacity);
    const durationHours=Number(row.duration_hours)||3, durationMinutes=Number(row.duration_minutes)||durationHours*60;
    return {id:row.id, name:row.name, official:row.community_id===OFFICIAL, format, ...(format==='solo' ? {sim:simForEvent(row)} : {}), details:normalizeTdzDetails(JSON.parse(row.details||'{}')), access:row.access||'open', capacity, rounds:JSON.parse(row.rounds||'[]'), circuit:row.circuit||'', durationHours, durationMinutes, driverChangeRequired:row.driver_change_required==null?null:Boolean(row.driver_change_required), eventType:row.event_type||'private', schedulePending:Boolean(row.schedule_pending), createdByMe:Boolean(actor.user && row.created_by===actor.user.id), categories:JSON.parse(row.categories), version:row.version,
      ...(crewsOfStreams.has(row.id) ? {streamCrew:crewsOfStreams.get(row.id)} : {}), absences:absences.get(row.id) || [], departures:JSON.parse(row.departures).map(d => {
        const availability=grouped.get(`${row.id}:${d.id}`) || [];
        // Solo race: entries keep their order of arrival; beyond the number of places they are on the
        // waiting list, and the first one waiting moves up by itself when someone withdraws.
        if (isGrindfest(row)) assignStreamerWaitlist(availability, streamersOf(row));
        else if (format==='solo' && capacity) availability.forEach((reg,index)=>{ reg.waitlistPosition=index>=capacity?index-capacity+1:null; });
        // Rounds with their own places: the same, round by round (a pilot skipping a round takes no place in it).
        const rounds=format==='solo'?JSON.parse(row.rounds||'[]'):[];
        if (!isGrindfest(row) && rounds.length>1 && rounds.some(round=>round.capacity)) {
          const counts=rounds.map(()=>0);
          availability.forEach(reg=>{ reg.roundWaitlist=rounds.map((round,index)=>{ if(reg.roundChoices?.[index]?.skip)return null; counts[index]++; return round.capacity&&counts[index]>round.capacity?counts[index]-round.capacity:null; }); });
        }
        // endsAt: the real finish (2 h 30 ends 30 min into the third presence slot).
        return {...d, endsAt:d.startsAt+durationMinutes*60000, availability, crews:crewsByDeparture.get(`${row.id}:${d.id}`) || []};
      })};
  }).map(event => hidePassword(event, actor));
}
// Event lists expose the password only to entered pilots; editors fetch it explicitly.
function hidePassword(event, actor) {
  if (!event.details?.password) return event;
  const entered = !isGrindfest(event) && event.departures.some(departure => departure.availability.some(reg => reg.mine && reg.status !== 'unavailable'));
  if (entered) return event;
  const {password, ...details} = event.details;
  return {...event, details};
}
async function oauthStart(request, env) {
  requireDiscord(env); await rateLimit(request, env, 'oauth', 20); await cleanup(env);
  const state = token();
  await env.DB.prepare('INSERT INTO oauth_states(state_hash,expires_at) VALUES(?,?)').bind(await hash(state), now() + 600).run();
  const auth = new URL('https://discord.com/oauth2/authorize');
  auth.search = new URLSearchParams({client_id:env.DISCORD_CLIENT_ID, response_type:'code', redirect_uri:origin(env) + '/api/auth/discord/callback', scope:'identify', state}).toString();
  // Discord knows one return address (the main one): the page to reopen afterwards, on the community site
  // where the sign-in started, is kept in a cookie shared by the sites of the platform.
  const back = siteOrigin(request, env) + returnPath(new URL(request.url).searchParams.get('return'));
  const names = cookieNames(env);
  return redirect(auth.href, [setCookie(names.state, state, 600, names.domain), setCookie(names.ret, encodeURIComponent(back), 600, names.domain)]);
}
async function oauthCallback(request, env) {
  requireDiscord(env);
  const url = new URL(request.url), state = url.searchParams.get('state');
  const names = cookieNames(env);
  const clear = setCookie(names.state, '', 0, names.domain), clearReturn = setCookie(names.ret, '', 0, names.domain);
  // Back to the page (and community site) the sign-in started from; anything else: the main home page.
  let back = origin(env) + '/';
  try {
    const wanted = new URL(decodeURIComponent(cookie(request, names.ret)));
    if (wanted.origin === origin(env) || communityLabel(wanted, env)) back = wanted.origin + returnPath(wanted.pathname + wanted.hash);
  } catch {}
  const failed = () => redirect(new URL(back).origin + '/?auth=error', [clear, clearReturn]);
  // Why a sign-in fails is written to the Worker logs (never a code, token or secret).
  if (!state || !/^[a-f0-9]{64}$/.test(state) || state !== cookie(request, names.state)) { console.error('Discord sign-in failed: state', state ? (cookie(request, names.state) ? 'mismatch' : 'no browser cookie') : 'missing'); return failed(); }
  const row = await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING state_hash').bind(await hash(state), now()).first();
  if (!row || !url.searchParams.get('code') || url.searchParams.has('error')) { console.error('Discord sign-in failed:', !row ? 'state expired or reused' : url.searchParams.get('error') || 'no code'); return failed(); }
  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID, client_secret:env.DISCORD_CLIENT_SECRET, grant_type:'authorization_code', code:url.searchParams.get('code'), redirect_uri:origin(env) + '/api/auth/discord/callback'}), signal:AbortSignal.timeout(10000)});
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw Error(`token ${response.status} ${String(detail.error || '').slice(0, 40)}`); }
    const auth = await response.json();
    const profileResponse = await fetch('https://discord.com/api/v10/users/@me', {headers:{Authorization:`Bearer ${auth.access_token}`}, signal:AbortSignal.timeout(10000)});
    if (!profileResponse.ok) throw Error(`profile ${profileResponse.status}`);
    const profile = await profileResponse.json();
    if (!/^\d{15,22}$/.test(profile.id)) throw Error('identity');
    const display = String(profile.global_name || profile.username || 'Pilote').slice(0, 32);
    const avatarHash = typeof profile.avatar === 'string' && /^[A-Za-z0-9_]{1,128}$/.test(profile.avatar) ? profile.avatar : '';
    const session = token();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').bind(profile.id, display, now()),
      env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await hash(session), profile.id, now() + SESSION_DAYS * DAY)
    ]);
    await discoverMemberships(env, await allCommunities(env), profile.id).catch(error => console.error('Memberships at sign-in:', String(error?.message || '').slice(0, 80)));
    const old = cookie(request, names.session);
    if (old) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(old)).run();
    const avatarCookie = avatarHash
      ? `em_discord_avatar=${encodeURIComponent(`${profile.id}:${avatarHash}`)}; Path=/;${names.domain ? ` Domain=${names.domain};` : ''} Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * DAY}`
      : `em_discord_avatar=; Path=/;${names.domain ? ` Domain=${names.domain};` : ''} Secure; SameSite=Lax; Max-Age=0`;
    return redirect(back, [clear, clearReturn, setCookie(names.session, session, SESSION_DAYS * DAY, names.domain), avatarCookie]);
  } catch (error) {
    console.error('Discord sign-in failed:', String(error?.message || 'unknown').slice(0, 80));
    return failed();
  }
}
async function api(request, env) {
  if (!env.DB) fail(503, 'La base partagée n’est pas encore configurée.');
  const url = new URL(request.url), path = racesPath(url.pathname), method = request.method;
  // The main address, or a community address of the platform (BASE_DOMAIN).
  const canonical = siteOrigin(request, env);
  if (url.origin !== canonical) fail(403, 'Utilise l’adresse principale du site pour cette action.');
  // The SimHub plugin of the fiches combo (server/combos.mjs): no browser, only the pilot's own key.
  if (path.startsWith('/api/combos/plugin/')) return combosPlugin(path, request, env);
  if (!['GET','HEAD'].includes(method)) {
    if (request.headers.get('Origin') !== canonical) fail(403, 'Origine de la requête refusée.');
    await rateLimit(request, env, 'write', 80);
  }
  if (path === '/api/auth/discord' && method === 'GET') return oauthStart(request, env);
  if (path === '/api/auth/discord/callback' && method === 'GET') return oauthCallback(request, env);
  // Banner of the community: public (shown on the welcome screen too), cached for good (its address changes with it),
  // answered before the sign-in and access checks it does not need.
  if (path === '/api/community/banner' && method === 'GET') {
    const row = await env.DB.prepare('SELECT b.image, b.content_type FROM community_banners b JOIN communities c ON c.id=b.community_id WHERE c.slug=?').bind(communitySlug(env, request)).first();
    if (!row) fail(404, 'Aucune bannière.');
    return new Response(new Uint8Array(row.image), {headers:{'Content-Type':row.content_type, 'Cache-Control':'public, max-age=31536000, immutable', 'X-Content-Type-Options':'nosniff'}});
  }
  const actor = await identity(request, env);
  // Every request below works inside one community (separation entry point, server/community.mjs), with
  // the permissions the player's Discord roles give in it (server/access.mjs).
  const community = await currentCommunity(env, request);
  // The main address of the platform (endurance-manager.app) is a showcase: fictional races anyone can look at.
  // Once the official Discord server is linked to it, it is the official community, like any other.
  const mainAddress = Boolean(baseDomain(env)) && url.hostname === baseDomain(env);
  const openSite = mainAddress && !community.discordGuildId;
  const access = await communityAccess(env, actor, community, {open:openSite});
  actor.permissions = access.permissions;
  actor.manager = access.manager;
  if (actor.user) actor.user = {...actor.user, role:displayRole(access)};
  if (path === '/api/session' && method === 'GET' && actor.user && access.status === 'member') actor.user.name = await communityName(env, actor.user.id, community.id) || actor.user.name;
  const diagnostics = await clientErrorsApi(path,method,env,actor,community);
  if (diagnostics) return diagnostics;
  // Requests for a new community: sent by anyone signed in with Discord, from any site (server/community-requests.mjs).
  const requests = await communityRequestsApi(path, method, request, env, actor);
  if (requests) return requests;
  // Each opening of the site renews the sign-in (once a day at most), so it never runs out for a pilot who comes back.
  if (path === '/api/session' && method === 'GET') return json({user:actor.user, discordReady:!!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET), adminConfigured:administrators(env).length > 0, soloRaces:soloRacesEnabled(env, community), iracingImport:community.modules?.iracingImport===true, categoryEntry:community.modules?.categoryEntry === true, soloLabel:eventsLabel(community, isDevelopment(env)), eventTdz:tdzOnly(community, isDevelopment(env)), tdzSeason:access.status === 'member' && soloRacesEnabled(env, community) && tdzOnly(community, isDevelopment(env)) ? await communitySeason(env, community).catch(() => null) : null, eventTypes:!tdzOnly(community, isDevelopment(env)) ? [] : grindfestEnabled(community, isDevelopment(env)) ? [...TDZ_EVENT_TYPES, 'Gridfest'] : TDZ_EVENT_TYPES, grindfest:grindfestEnabled(community, isDevelopment(env)), grindfestAvailable:grindfestAvailable(community, isDevelopment(env)), safeGuideUrl:community.modules?.safeGuideUrl || '',
    // The community's stream link (« Annonce du jour »), for the events it streams on the week (members only).
    mayStream:access.status === 'member' && await mayStream(env, {permissions:access.permissions}, community, actor),
    communityStreamUrl:access.status === 'member' && soloRacesEnabled(env, community) ? announceStream(await botRecapSettings(env, community).catch(() => null)) : '',
    combos:combosEnabled(community) && access.permissions.has('combos'),
    community:{id:community.id, slug:community.slug, name:community.name, shortName:community.shortName, discordInviteUrl:community.discordInviteUrl, appearance:appearanceOf(community)},
    access:access.status, permissions:[...access.permissions], manager:access.manager, communities:await myCommunities(env, actor, community),
    elsewhere:['not-member','forbidden'].includes(access.status) ? (await myCommunities(env, actor, community, true)).filter(item => !item.current).map(({name, url, logoUrl}) => ({name, url, logoUrl})) : [], openSite,
    platformDiscordUrl:/^https:\/\/(discord\.gg|discord\.com\/invite)\//.test(env.PLATFORM_DISCORD_URL || '') ? env.PLATFORM_DISCORD_URL : null}, 200, actor.user && actor.renew ? await actor.renew().catch(() => []) : []);
  // « Nouveautés » page: the pilot's communities and whether he administers each one (front/changelog.mjs).
  if (path === '/api/changelog-audience' && method === 'GET') {
    if (!actor.user || actor.manager) return json({all:Boolean(actor.manager), communities:[]});
    const memberships = (await env.DB.prepare("SELECT * FROM memberships WHERE user_id=? AND status='member'").bind(actor.user.id).all()).results || [];
    const communities = [];
    for (const membership of memberships) {
      const item = await communityById(env, membership.community_id);
      const permissions = item ? await memberPermissions(env, item, membership) : new Set();
      if (permissions.has('access')) communities.push({names:[item.slug, item.shortName, item.name].filter(Boolean), admin:permissions.has('admin')});
    }
    return json({all:false, communities});
  }
  // The explanation of communities has been read: not shown again, on any device.
  if (path === '/api/me/community-intro' && method === 'POST') {
    if (!actor.user) fail(401, 'Connecte-toi avec Discord.');
    await env.DB.prepare('UPDATE users SET community_intro_seen=1 WHERE id=?').bind(actor.user.id).run();
    return json({ok:true});
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    const names = cookieNames(env), raw = cookie(request, names.session);
    if (raw) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(raw)).run();
    return json({ok:true}, 200, [setCookie(names.session, '', 0, names.domain), `em_discord_avatar=; Path=/;${names.domain ? ` Domain=${names.domain};` : ''} Secure; SameSite=Lax; Max-Age=0`]);
  }
  // Entries without an account are gone: a community is only open to the members of its Discord server.
  if (path === '/api/guest/recover' || path === '/api/guest/link') fail(410, 'Les inscriptions sans compte Discord ne sont plus possibles.');
  // Everything below needs a member of the community (or a platform manager).
  if (access.status === 'anonymous') fail(401, 'Connecte-toi avec Discord pour accéder à cette communauté.');
  if (access.status === 'forbidden') fail(403, 'Tu n’as pas l’autorisation d’accéder à Endurance Manager dans cette communauté. Demande à un administrateur du Discord.');
  if (access.status !== 'member') fail(403, access.status === 'not-member'
    ? `Cette communauté est réservée aux membres du serveur Discord « ${community.name} ».`
    : 'L’accès à cette communauté ne peut pas être vérifié pour le moment. Réessaie plus tard.');
  // The bell next to the account (server/notifications.mjs).
  const notifications = await notificationsApi(path, method, env, actor, community);
  if (notifications) return notifications;
  // Fiches combo (server/combos.mjs).
  const combos = await combosApi(path, method, request, env, actor, community);
  if (combos) return combos;
  const gridfestPasswords = path.match(/^\/api\/events\/([a-f0-9-]{36})\/gridfest\/passwords$/);
  if (gridfestPasswords && ['GET','POST'].includes(method)) {
    requirePermission(actor,'admin');
    const event = await eventById(env, gridfestPasswords[1], community);
    if (!isGrindfest(event) || event.community_id !== community.id) fail(404, 'Gridfest introuvable.');
    if (method === 'GET') return json(await gridfestPasswordStatus(env, community, event));
    const input = await body(request);
    if (input.version !== event.version) fail(409, 'Le Gridfest a changé. Actualise la page avant l’envoi.');
    return json(await sendGridfestPasswords(env, community, event, input.cursor || ''));
  }
  if (path === '/api/events' && method === 'GET') {
    const requestedGame=url.searchParams.get('game');
    const game=requestedGame==='lmu'||requestedGame==='iracing'?requestedGame:'';
    const requestedScope=url.searchParams.get('scope');
    const scope=requestedScope==='upcoming'||requestedScope==='archived'?requestedScope:'';
    // Authentication and community access above still run for every conditional request.
    const at=Date.now();
    const tag=await eventListTag(env,actor,community,{game,scope,origin:url.origin,at});
    if (matchesEventTag(request.headers.get('If-None-Match'),tag)) {
      return new Response(null,{status:304,headers:{'ETag':tag,'Cache-Control':'no-store','Vary':'Cookie'}});
    }
    const events=await listEvents(env,actor,game,scope,community,at);
    const payload={events};
    const serialized=JSON.stringify(payload);
    const response=jsonText(serialized);
    response.headers.set('X-Endurance-Game',game||'all');
    response.headers.set('X-Endurance-Scope',scope||'all');
    response.headers.set('X-Endurance-Events',String(events.length));
    response.headers.set('X-Endurance-Approx-Bytes',String(new TextEncoder().encode(serialized).length));
    if (tag) response.headers.set('ETag',tag);
    response.headers.set('Vary','Cookie');
    return response;
  }
  if (path === '/api/participants' && method === 'GET') {
    if (!actor.user) fail(401,'Connecte-toi avec Discord pour choisir un pilote.');
    // The members of this community only (its Discord server), with their pilot entry here.
    // The main address has no members (anyone signed in only looks): the players with a pilot entry here, never
    // every account of the platform (the other communities' players stay out of sight).
    if (openSite) return json({participants:(await env.DB.prepare(`SELECT u.id,p.name,p.id AS participantId
      FROM participants p JOIN users u ON u.id=p.user_id
      WHERE p.community_id=? AND u.id NOT LIKE 'system:%'
      ORDER BY lower(p.name),u.id`).bind(community.id).all()).results});
    return json({participants:(await env.DB.prepare(`SELECT u.id,COALESCE(NULLIF(m.nickname,''),u.name) AS name,p.id AS participantId
      FROM memberships m JOIN users u ON u.id=m.user_id
      LEFT JOIN participants p ON p.user_id=u.id AND p.community_id=m.community_id
      WHERE m.community_id=? AND m.status='member'
      ORDER BY lower(COALESCE(NULLIF(m.nickname,''),u.name)),u.id`).bind(community.id).all()).results});
  }
  // Crews and crew requests (server/api-crews.mjs).
  const crewAnswer = await crewsApi({path, method, request, env, actor, community});
  if (crewAnswer) return crewAnswer;
  if (path === '/api/events' && method === 'POST') {
    requirePermission(actor,'create_race','Tu n’as pas l’autorisation de créer une course dans cette communauté.');
    // Allow twelve inline logos (6000 base64 characters each) plus event fields.
    const input = plainSoloInput(env, community, await body(request, 96000));
    if (input.format === 'solo' && !soloRacesEnabled(env, community)) fail(400, 'Les événements ne sont pas activés sur ce site.');
    const data = validateEvent(input), eventId = id();
    if (isGrindfest(data) && (!grindfestEnabled(community, isDevelopment(env)) || input.official === true)) fail(403, 'Gridfest est réservé aux TDZ et doit être activé dans les modules.');
    // « Course officielle (toutes les communautés) »: the platform managers only.
    if (input.official === true && !actor.manager) fail(403, 'Seuls les gestionnaires de la plateforme créent des courses officielles.');
    if (input.official === true && data.sim === STREAM_SIM) fail(400, 'Un stream reste dans sa communauté.');
    const owner = input.official === true ? OFFICIAL : community.id;
    await dropEmptyCommonStart(env, null, data);
    await env.DB.prepare('INSERT INTO events(id,name,duration_hours,duration_minutes,event_type,circuit,schedule_pending,driver_change_required,format,access,capacity,rounds,categories,departures,created_by,created_at,community_id,sim,details) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(eventId, data.name, data.durationHours, data.durationMinutes, data.eventType, data.circuit, data.schedulePending?1:0, data.driverChangeRequired==null?null:(data.driverChangeRequired?1:0), data.format, data.access, data.capacity, JSON.stringify(data.rounds), JSON.stringify(data.categories), JSON.stringify(data.departures), actor.user.id, now(), owner, data.sim, JSON.stringify(data.details)).run();
    return json({id:eventId}, 201);
  }
  // « Rendre officielle »: a race of the community becomes common to every community (managers); its entries and
  // crews stay in their community.
  const officialMatch = path.match(/^\/api\/events\/([a-f0-9-]{36})\/official$/);
  if (officialMatch && method === 'POST') {
    if (!actor.manager) fail(403, 'Seuls les gestionnaires de la plateforme rendent une course officielle.');
    const event = await eventById(env, officialMatch[1], community);
    if (event.community_id === OFFICIAL) return json({ok:true});
    if ((event.format || 'endurance') === 'solo') fail(400, 'Un événement reste dans sa communauté.');
    await env.DB.prepare('UPDATE events SET community_id=?,version=version+1 WHERE id=? AND community_id=?').bind(OFFICIAL, event.id, community.id).run();
    return json({ok:true});
  }
  const editDetails = path.match(/^\/api\/events\/([a-f0-9-]{36})\/edit-details$/);
  if (editDetails && method === 'GET') {
    const event=await eventById(env,editDetails[1],community);
    if(event.community_id===OFFICIAL&&!actor.manager)fail(403,'Une course officielle se modifie par les gestionnaires de la plateforme.');
    if(!can(actor,'manage_races')&&!(can(actor,'create_race')&&event.created_by===actor.user?.id))requirePermission(actor,'manage_races');
    return json({details:normalizeTdzDetails(JSON.parse(event.details||'{}'))});
  }
  const eventMatch = path.match(/^\/api\/events\/([a-f0-9-]{36})$/);
  if (eventMatch && ['PATCH','DELETE'].includes(method)) {
    const event = await eventById(env, eventMatch[1], community), input = await body(request, 96000);
    if (event.community_id === OFFICIAL && !actor.manager) fail(403, 'Une course officielle se modifie par les gestionnaires de la plateforme.');
    // Every race with "Gérer toutes les courses"; one's own races with "Créer une course".
    if (!can(actor,'manage_races') && !(can(actor,'create_race') && event.created_by === actor.user?.id)) requirePermission(actor,'manage_races','Tu n’as pas l’autorisation de modifier cette course.');
    if (input.version !== event.version) fail(409, 'Cet événement a changé. Actualise avant de réessayer.');
    if (method === 'DELETE') {
      const told = await eventPilots(env, event.id);
      const result = await env.DB.prepare('DELETE FROM events WHERE id=? AND version=?').bind(event.id, input.version).run();
      if (!result.meta.changes) fail(409, 'Cet événement a changé. Actualise avant de réessayer.');
      await notify(env, told, 'race_deleted', event, {skip:[actor.user?.id]});
      return json({ok:true});
    }
    const data = validateEvent(plainSoloInput(env, community, input), event);
    if (isGrindfest(data) && !grindfestEnabled(community, isDevelopment(env))) fail(403, 'Gridfest n’est pas activé.');
    // The provisional start is an event-level waiting area, not a real time slot.
    // Keep its entries (and crews) when an organiser publishes actual start times.
    const oldCommon = JSON.parse(event.departures || '[]').find(d => d.tbd);
    const oldCommonUsed = oldCommon && await env.DB.prepare(
      'SELECT 1 FROM registrations WHERE event_id=? AND departure_id=? UNION SELECT 1 FROM crews WHERE event_id=? AND departure_id=? LIMIT 1'
    ).bind(event.id, oldCommon.id, event.id, oldCommon.id).first();
    if (oldCommonUsed) {
      const reused = data.departures.find(d => d.id === oldCommon.id);
      if (reused && !reused.tbd) reused.id = id(); // A real start cannot take over waiting entries.
      if (!data.departures.some(d => d.id === oldCommon.id)) data.departures.unshift(oldCommon);
    }
    // A start removed with pilots on it: they go back to the waiting start ("Horaire à définir") and pick a time again.
    const moves = await waitingMoves(env, event, data);
    if (!moves) await dropEmptyCommonStart(env, event.id, data);
    const newlyPublished = Boolean(oldCommonUsed && data.departures.some(d => !d.tbd) &&
      !JSON.parse(event.departures || '[]').some(d => !d.tbd));
    const cats = JSON.stringify(data.categories), deps = JSON.stringify(data.departures);
    const update = env.DB.prepare(`UPDATE events SET name=?,duration_hours=?,duration_minutes=?,event_type=?,circuit=?,schedule_pending=?,driver_change_required=?,access=?,capacity=?,rounds=?,categories=?,departures=?,sim=?,details=?,version=version+1 WHERE id=? AND version=?
      AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.event_id=events.id AND
        (NOT EXISTS (SELECT 1 FROM json_each(?) d WHERE json_extract(d.value,'$.id')=r.departure_id)
      OR (r.category NOT IN ('','*') AND NOT EXISTS (SELECT 1 FROM json_each(?) c WHERE c.value=r.category))
      OR (r.streamer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM json_each(?) s WHERE json_extract(s.value,'$.id')=r.streamer_id))
      OR EXISTS (SELECT 1 FROM json_each(?) h WHERE instr(',' || r.status || ',', ',' || h.value || ',') > 0)))`).bind(data.name, data.durationHours, data.durationMinutes, data.eventType, data.circuit, data.schedulePending?1:0, data.driverChangeRequired==null?null:(data.driverChangeRequired?1:0), data.access, data.capacity, JSON.stringify(data.rounds), cats, deps, data.sim, JSON.stringify(data.details), event.id, input.version, deps, cats, JSON.stringify(data.details.streamers || []), JSON.stringify(Array.from({length:24-data.durationHours},(_,i)=>`h${data.durationHours+i+1}`)));
    const refused = 'Modification impossible : événement modifié ailleurs, catégorie encore utilisée, ou disponibilités au-delà de la nouvelle durée. Ajuste les disponibilités concernées avant de raccourcir la course.';
    if (moves) {
      // One transaction: the entries move only if the race itself is saved (the last statement fails otherwise).
      try { await env.DB.batch([...moves.statements(input.version), update,
        env.DB.prepare("SELECT CASE WHEN (SELECT version FROM events WHERE id=?)<>? THEN json('refused') END").bind(event.id, input.version + 1)]); }
      catch { fail(409, refused); }
    } else if (!(await update.run()).meta.changes) fail(409, refused);
    // The entered pilots are told what changed for them: the starts, the track, the length or the name.
    const starts = list => JSON.stringify(JSON.parse(list).map(d => [d.id, d.startsAt, Boolean(d.tbd)]));
    const changes = [starts(event.departures) !== starts(deps) && 'starts', (event.circuit || '') !== data.circuit && 'circuit',
      (Number(event.duration_minutes) || Number(event.duration_hours) * 60) !== data.durationMinutes && 'duration', event.name !== data.name && 'name'].filter(Boolean);
    // Pilots waiting for a time are asked to pick one (crews: their manager), as soon as real times exist.
    const saved = {...event, name:data.name, circuit:data.circuit}, waiting = data.departures.find(d => d.tbd);
    const told = waiting && (newlyPublished || moves) && data.departures.some(d => !d.tbd) ? await askToChooseStart(env, saved, waiting.id) : [];
    if (changes.length) await notify(env, await eventPilots(env, event.id), 'race_changed', saved, {skip:[actor.user?.id, ...told], changes, previousName:event.name !== data.name ? event.name : undefined});
    return json({ok:true});
  }
  // « Je serai absent » on an event or an endurance, for oneself; entering the event withdraws it.
  const absenceMatch = path.match(/^\/api\/events\/([a-f0-9-]{36})\/absence$/);
  if (absenceMatch && ['PUT','DELETE'].includes(method)) {
    const event = await eventById(env, absenceMatch[1], community);
    if (!actor.user) fail(401, 'Connecte-toi avec Discord.');
    // After the last start, nothing changes any more; « Absent » is for those who could enter.
    if (Math.max(...JSON.parse(event.departures || '[]').map(d => Number(d.startsAt) || 0)) <= Date.now()) fail(409, 'Cet événement est passé.');
    if (method === 'PUT' && event.sim === STREAM_SIM) fail(409, 'Un stream n’a pas d’inscription.');
    if (method === 'DELETE') { await env.DB.prepare('DELETE FROM event_absences WHERE event_id=? AND user_id=? AND community_id=?').bind(event.id, actor.user.id, community.id).run(); return json({ok:true}); }
    if (!(event.format === 'solo' && tdzOnly(community, isDevelopment(env)) ? can(actor, 'solo_open') || can(actor, 'solo_safe') : can(actor, 'endurance'))) fail(403, 'Tu n’as pas l’autorisation de t’inscrire à cet événement.');
    if (await env.DB.prepare("SELECT 1 FROM registrations WHERE event_id=? AND user_id=? AND community_id=? AND COALESCE(status,'')!='unavailable' LIMIT 1").bind(event.id, actor.user.id, community.id).first())
      fail(409, 'Tu es inscrit à cet événement : retire d’abord ton inscription.');
    await env.DB.prepare('INSERT OR IGNORE INTO event_absences(event_id,user_id,community_id,created_at) VALUES(?,?,?,?)').bind(event.id, actor.user.id, community.id, now()).run();
    return json({ok:true});
  }
  const departureMatch = path.match(/^\/api\/events\/([a-f0-9-]{36})\/departures\/([a-f0-9-]{36})\/registrations$/);
  if (departureMatch && method === 'POST') {
    const event = await eventById(env, departureMatch[1], community);
    const departure = departureById(event, departureMatch[2]);
    if (departure.startsAt <= Date.now()) fail(409, 'Ce départ est passé. Les inscriptions sont fermées.');
    // Real times known: a new entry goes on one of them, not on the waiting start.
    if (departure.tbd && JSON.parse(event.departures).some(d => !d.tbd && d.startsAt > Date.now())) fail(409, 'Les horaires sont connus : choisis l’un d’eux.');
    if (event.sim === STREAM_SIM) fail(409, 'Un stream n’a pas d’inscription.');
    const input = await body(request);
    // Official race: an own entry is made for the community chosen at its first step (another pilot: the site's).
    if (input.communityId && input.communityId !== community.id && (input.forOther === true || input.participantUserId || input.participantId)) fail(400, 'Un autre pilote s’inscrit dans la communauté du site.');
    const {community:here, actor:who} = await actingCommunity(env, actor, community, input.communityId, event);
    const solo = (event.format||'endurance') === 'solo';
    // Own entry: "S'inscrire". Someone else's (Discord pilot or typed name): "Inscrire un autre pilote".
    const forOther = input.forOther === true || Boolean(input.participantUserId);
    if (forOther) requirePermission(who,'manage_registrations','Tu n’as pas l’autorisation d’inscrire un autre pilote dans cette communauté.');
    // Solo races: OPEN for "Courses solo OPEN" or "SAFE", SAFE only for "SAFE". Endurances: "Endurances".
    else if (solo && !tdzOnly(community, isDevelopment(env))) requirePermission(who,'endurance','Tu n’as pas l’autorisation de t’inscrire aux événements de cette communauté.');
    else if (solo && event.access === 'safe') requirePermission(who,'solo_safe','Cet événement est réservé aux pilotes SAFE. Demande à un administrateur du Discord.');
    else if (solo) { if (!can(who,'solo_safe')) requirePermission(who,'solo_open','Tu n’as pas l’autorisation de t’inscrire aux événements de cette communauté.'); }
    else requirePermission(who,'endurance','Tu n’as pas l’autorisation de t’inscrire aux endurances de cette communauté.');
    const data = validateRegistration(input, event);
    const stream = !solo && !forOther && await mayStream(env, who, here, actor) ? registrationStream(input) : {time:'', end:''};
    const participant=await registrationParticipant(env,who,input,data,here);
    if (solo && await env.DB.prepare('SELECT 1 FROM registrations WHERE event_id=? AND departure_id=? AND participant_id=? LIMIT 1').bind(event.id,departure.id,participant.id).first()) fail(409, 'Ce pilote est déjà inscrit à cette course. Modifie son inscription.');
    const userId=participant.user_id;
    // Official race: a Discord account enters a start once, whatever the community.
    if (userId && event.community_id === OFFICIAL && await env.DB.prepare('SELECT 1 FROM registrations WHERE event_id=? AND departure_id=? AND user_id=? AND community_id<>? LIMIT 1').bind(event.id, departure.id, userId, here.id).first())
      fail(409, forOther ? 'Ce pilote est déjà inscrit à ce départ avec une autre de ses communautés.' : 'Tu es déjà inscrit à ce départ avec une autre de tes communautés : modifie ton inscription depuis son site.');
    const guestHash=userId?null:participant.guest_hash||await hash(token());
    const ownerUserId = actor.user?.id || null;
    const regId = id();
    if (input.participantId) { data.name=participant.name;data.nameKey=data.name.normalize('NFKC').toLocaleLowerCase('fr-FR'); }
    // Another category on a start the pilot is already entered on: the others were told the first time.
    const alreadyThere=Boolean(await env.DB.prepare('SELECT 1 FROM registrations WHERE event_id=? AND departure_id=? AND participant_id=? LIMIT 1').bind(event.id,departure.id,participant.id).first());
    const result = await env.DB.prepare(`INSERT INTO registrations(id,event_id,departure_id,user_id,owner_user_id,guest_hash,name,name_key,category,car,car_preferences,car_any,status,preferred_pilot,comment,created_at,participant_id,round_choices,solo_driver,community_id,game_name,streamer_id,streamer_order)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ? IS NOT NULL THEN (SELECT COALESCE(MAX(streamer_order),0)+1 FROM registrations WHERE event_id=?) ELSE NULL END FROM events WHERE id=? AND version=? AND (community_id=? OR community_id=?)`).bind(regId,event.id,departure.id,userId,ownerUserId,guestHash,data.name,data.nameKey,data.category,data.car,JSON.stringify(data.cars),data.carAny?1:0,data.status,data.preferredPilot,data.comment||'',now(),participant.id,JSON.stringify(data.roundChoices||[]),data.soloDriver?1:0,here.id,data.gameName || '',data.streamerId || null,data.streamerId || null,event.id,event.id,event.version,community.id,OFFICIAL).run();
    if (!result.meta.changes) fail(409, 'Cet événement a changé. Actualise avant de t’inscrire.');
    // An admin entering himself on an endurance can say he streams this start.
    if (stream.time) await env.DB.prepare('UPDATE registrations SET stream_time=?,stream_end=? WHERE id=?').bind(stream.time,stream.end,regId).run();
    if (userId && data.status!=='unavailable') await env.DB.prepare('DELETE FROM event_absences WHERE event_id=? AND user_id=? AND community_id=?').bind(event.id, userId, here.id).run();
    if (!alreadyThere && data.status!=='unavailable') await notify(env,await departurePilots(env,event.id,departure.id,here.id),'entry',event,{departure,skip:[actor.user?.id,userId],pilot:data.name,category:data.category});
    if (forOther && userId && userId!==actor.user?.id) await notify(env,[{user_id:userId,community_id:here.id}],'entered_by',event,{departure,by:actor.user.name,category:data.category});
    return json({id:regId}, 201);
  }
  // A pilot without a crew on the common "Horaire à définir" start picks one of the official slots.
  const regMove = path.match(/^\/api\/registrations\/([a-f0-9-]{36})\/departure$/);
  if (regMove && method === 'PATCH') {
    // An entry of the site's community, or of another of the player's communities on an official race.
    const reg = await env.DB.prepare(registrationSelect+` WHERE r.id=? AND (r.community_id=? OR EXISTS (SELECT 1 FROM events oe WHERE oe.id=r.event_id AND oe.community_id='official'))`).bind(regMove[1],community.id).first();
    if (!reg) fail(404, 'Inscription introuvable.');
    const {actor:who, community:regCommunity} = await actingCommunity(env, actor, community, reg.community_id);
    if (!canManageRegistration(reg,who)) fail(403, 'Tu n’as pas l’autorisation de modifier cette inscription.');
    const input = await body(request);
    if (input.version !== reg.version) fail(409, 'Cette inscription a changé. Actualise la page.');
    const event = await eventById(env, reg.event_id, community), target = slotFor(event, departureById(event, reg.departure_id), input.departureId);
    const result = await env.DB.prepare(`UPDATE registrations SET departure_id=?,version=version+1 WHERE id=? AND version=?
      AND NOT EXISTS(SELECT 1 FROM crew_members WHERE registration_id=?)`).bind(target.id, reg.id, input.version, reg.id).run();
    if (!result.meta.changes) fail(409, 'Rejoins ou quitte d’abord ton équipage : c’est lui qui choisit le départ.');
    return json({ok:true, departureId:target.id});
  }
  const regMatch = path.match(/^\/api\/registrations\/([a-f0-9-]{36})$/);
  if (regMatch && ['PATCH','DELETE'].includes(method)) {
    const reg = await env.DB.prepare(registrationSelect+` WHERE r.id=? AND (r.community_id=? OR EXISTS (SELECT 1 FROM events oe WHERE oe.id=r.event_id AND oe.community_id='official'))`).bind(regMatch[1],community.id).first();
    if (!reg) fail(404, 'Inscription introuvable.');
    const {actor:who, community:regCommunity} = await actingCommunity(env, actor, community, reg.community_id);
    if (!canManageRegistration(reg,who)) fail(403, 'Tu n’as pas l’autorisation de modifier cette inscription.');
    const event = await eventById(env, reg.event_id, community), departure = departureById(event,reg.departure_id);
    if (departure.startsAt <= Date.now()) fail(409, 'Ce départ est passé. Les inscriptions sont verrouillées.');
    const input = await body(request);
    if (input.version !== reg.version) fail(409, 'Cette inscription a changé. Actualise la page.');
    let result;
    // A pilot leaving the race: his crew is told (and he is, when someone else takes him off).
    const crewOfEntry = method === 'DELETE' ? await env.DB.prepare('SELECT c.id,c.name FROM crew_members cm JOIN crews c ON c.id=cm.crew_id WHERE cm.registration_id=?').bind(reg.id).first() : null;
    if (method === 'DELETE') result = await env.DB.prepare('DELETE FROM registrations WHERE id=? AND version=?').bind(reg.id,input.version).run();
    else {
      const data = validateRegistration(input,event);
      const ownStream = input.stream !== undefined && (event.format || 'endurance') !== 'solo' && reg.participant_user_id && reg.participant_user_id === actor.user?.id && await mayStream(env, who, regCommunity, actor);
      const stream = ownStream ? registrationStream(input) : null;
      // A pilot linked to Discord keeps his Discord name: an edit cannot show him as another member.
      if (reg.participant_user_id) {
        data.name=await communityName(env, reg.participant_user_id, reg.community_id) || reg.participant_name || data.name;
        data.nameKey=data.name.normalize('NFKC').toLocaleLowerCase('fr-FR');
      }
      const results=await env.DB.batch([
        env.DB.prepare(`UPDATE registrations SET name=?,name_key=?,category=?,car=?,car_preferences=?,car_any=?,status=?,preferred_pilot=?,comment=?,round_choices=?,solo_driver=?,game_name=?,streamer_order=CASE WHEN COALESCE(streamer_id,'')!=COALESCE(?,'') THEN (SELECT COALESCE(MAX(streamer_order),0)+1 FROM registrations WHERE event_id=?) ELSE streamer_order END,streamer_id=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM events WHERE id=? AND version=?)`).bind(data.name,data.nameKey,data.category,data.car,JSON.stringify(data.cars),data.carAny?1:0,data.status,data.preferredPilot,data.comment||'',JSON.stringify(data.roundChoices||[]),data.soloDriver?1:0,data.gameName || '',data.streamerId || null,event.id,data.streamerId || null,reg.id,input.version,event.id,event.version),
        env.DB.prepare('UPDATE participants SET name=? WHERE id=? AND changes()=1').bind(data.name,reg.participant_id)
      ]);
      result=results[0];
      // His own entry: an admin streams this start or no longer does (an older page leaves it as it is).
      if (result.meta.changes && stream) {
        await env.DB.prepare('UPDATE registrations SET stream_time=?,stream_end=? WHERE id=?').bind(stream.time,stream.end,reg.id).run();
      }
    }
    if (!result.meta.changes) fail(409, 'Les données ont changé. Actualise avant de réessayer.');
    if (method === 'DELETE') {
      const pilot = reg.participant_name || reg.name;
      if (crewOfEntry) await notify(env,await crewPilots(env,crewOfEntry.id),'withdrawn',event,{departure,skip:[actor.user?.id,reg.participant_user_id],pilot,crewName:crewOfEntry.name});
      if (reg.participant_user_id && reg.participant_user_id !== actor.user?.id) await notify(env,[{user_id:reg.participant_user_id,community_id:reg.community_id}],'removed_by',event,{departure,by:actor.user?.name||'',category:reg.category});
    }
    return json({ok:true});
  }
  // The community's settings (server/api-community.mjs), then the platform managers' actions (server/api-platform.mjs).
  const settings = await communityApi({path, method, request, env, actor, community}) || await platformApi({path, method, request, env, actor, community, mainAddress, openSite});
  if (settings) return settings;
  if (path.startsWith('/api/members/')) fail(410, 'Les rôles se gèrent maintenant sur le serveur Discord de la communauté.');
  fail(404, 'Action introuvable.');
}
// An address that leads nowhere (old link, typo): a page saying so, with the way back, instead of a blank page.
function pageNotFound() {
  const page = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page introuvable · ENDURANCE MANAGER</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d0f;color:#e6ecea;font-family:system-ui,sans-serif;text-align:center;padding:24px}main{max-width:520px}h1{font-size:28px;margin:0 0 12px}p{color:#c7d0d4;line-height:1.6}a{color:#5fd3dc}</style></head>
<body><main><h1>Page introuvable</h1><p>Cette page n’existe pas ou plus. Le lien est peut-être ancien ou incomplet.</p><p><a href="/">Revenir à l’accueil</a></p></main></body></html>`;
  return new Response(page, {status:404, headers:{'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Robots-Tag':'noindex'}});
}
export default {
  async fetch(request, env) {
    const pathname=new URL(request.url).pathname;
    if (pathname === '/telemetry/client-error') {
      try { return await ingestClientError(request,env); }
      catch { return new Response(null,{status:204}); }
    }
    // The buttons of the races' threads on Discord (server/discord-interactions.mjs).
    if (pathname === '/discord/interactions') return discordInteraction(request, env);
    if (!pathname.startsWith('/api/')) {
      const asset = await env.ASSETS.fetch(request);
      return asset.status === 404 && (request.headers.get('Accept') || '').includes('text/html') ? pageNotFound() : asset;
    }
    try { return await measureRequest(request, env, measuredEnv => api(request, measuredEnv)); }
    catch (error) {
      if (error instanceof HttpError) return json({error:error.message},error.status);
      const message=String(error.message);
      if (message.includes('participant_already_assigned')) return json({error:'Ce pilote est déjà affecté à un équipage sur ce départ. Modifie son inscription existante, ou retire-le de l’équipage avant de changer de catégorie ou de le déclarer indisponible.'},409);
      if (message.includes('participant_required') || message.includes('participant_fixed')) return json({error:'Recharge le site pour retrouver la fiche du pilote.'},409);
      if (message.includes('community_mismatch') || message.includes('community_fixed') || message.includes('community_invalid')) return json({error:'Action refusée : ces données appartiennent à une autre communauté.'},403);
      if (message.includes('UNIQUE constraint failed: crew_members.')) return json({error:'Ce pilote appartient déjà à un équipage sur ce départ. Actualise la page.'},409);
      if (message.includes('crew_category_in_use')) return json({error:'Ce pilote est affecté à un équipage de cette catégorie. Retire d’abord son affectation pour changer de catégorie.'},409);
      if (message.includes('crew_event_in_use')) return json({error:'Un équipage utilise encore ce départ ou cette catégorie. Supprime ou modifie cet équipage avant de continuer.'},409);
      if (message.includes('crew_membership_invalid') || message.includes('crew_invalid')) return json({error:'Affectation impossible : vérifie le départ, la catégorie et la disponibilité du pilote, puis actualise.'},409);
      if (message.includes('UNIQUE constraint failed: registrations.')) return json({error:'Ce pilote ou ce pseudo est déjà inscrit dans cette catégorie pour ce départ. Modifie l’inscription existante ou choisis une autre catégorie.'},409);
      console.error('API failure', error instanceof Error ? error.message.replace(/[a-f0-9]{64}/g,'[redacted]') : 'unknown');
      return json({error:'Le service est momentanément indisponible. Tes changements ne sont pas confirmés ; réessaie dans un instant.'},503);
    }
  }
};


