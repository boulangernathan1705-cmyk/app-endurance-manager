import {assignStreamerWaitlist, grindfestEnabled, isGrindfest, streamersOf} from '../shared/grindfest.mjs';
import {normalizeTdzDetails, simForEvent} from '../shared/catalog.mjs';
import {LEGACY_CAR_ALIASES, NAME_IN_COMMUNITY, owned, personal, registrationSelect} from './core.mjs';
import {appearanceOf, communityFromRow, soloRacesEnabled} from './community.mjs';
import {ALL_PERMISSIONS, memberPermissions} from './access.mjs';
import {OFFICIAL, canManageRegistration, isRegistrationManager} from './api-shared.mjs';
import {canManageCrew} from './api-crews.mjs';
import {isDevelopment} from './dev-environment.mjs';
import {iracingSoloSql} from './iracing-visibility.mjs';
import {streamCrews} from './stream-crew.mjs';

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
export async function listEvents(env, actor, game='', scope='', community, at=Date.now()) {
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
