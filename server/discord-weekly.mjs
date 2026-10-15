import {iracingSoloSql} from './iracing-visibility.mjs';
import {allCommunities, communityUrl, appearanceOf} from './community.mjs';
import {isInParisWeek, parisWeek} from './discord-weekly-format.mjs';
import {syncBotRecaps, botRecapSettings} from './recap-discord.mjs';

// All publications are now managed by the bot; historical webhook rows are inert.
const CIRCUITS = {all:'', lmu:"AND circuit NOT LIKE 'iracing-%'", iracing:"AND circuit LIKE 'iracing-%'"};

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

// The community in the message: its site (every link goes there), name, Discord icon and banner.
export function siteOf(env, community) {
  let url = '';
  try { url = communityUrl(env, community); } catch { return {name:community.name}; }
  const look = appearanceOf(community);
  return {url, name:community.name, logoUrl:look.logoUrl || undefined, bannerUrl:`${url}${look.bannerUrl || '/images/endurance-manager-banner.webp'}`};
}

export function flattenDepartures(events) {
  const departures = [];
  for (const event of events) {
    const eventDepartures = parseJson(event.departures, []);
    if (!Array.isArray(eventDepartures)) continue;
    const durationHours = Number(event.duration_hours) || 0, durationMinutes = Number(event.duration_minutes) || durationHours * 60;
    for (const departure of eventDepartures) {
      const startsAt = Number(departure?.startsAt);
      if (!departure?.id || !Number.isFinite(startsAt)) continue;
      departures.push({
        eventId: event.id,
        eventName: event.name,
        eventType: event.event_type || '',
        circuit: event.circuit || '',
        durationHours,
        durationMinutes,
        departureId: departure.id,
        // "Horaires à confirmer": the time of the start is only a placeholder.
        timePending: Boolean(event.schedule_pending) || departure.tbd === true,
        startsAt,
        endsAt: startsAt + durationMinutes * 60_000,
        crews: [],
        registrations: [],
        pilotCount: 0,
        unassignedPilots: []
      });
    }
  }
  departures.sort((a,b) => a.startsAt-b.startsAt || a.eventName.localeCompare(b.eventName,'fr'));
  return departures;
}

function selectPlanningWeek(allDepartures, timestamp) {
  const currentWeek = parisWeek(timestamp);
  let week = currentWeek;
  let futureDepartures = allDepartures.filter(item => item.startsAt > timestamp && isInParisWeek(item.startsAt, currentWeek));

  if (!futureDepartures.length) {
    const firstFuture = allDepartures.find(item => item.startsAt > timestamp);
    if (firstFuture) {
      week = parisWeek(firstFuture.startsAt);
      futureDepartures = allDepartures.filter(item => item.startsAt > timestamp && isInParisWeek(item.startsAt, week));
    }
  }

  return {week, futureDepartures};
}

export async function loadWeeklyDiscordSnapshot(env, timestamp, community, scope = 'lmu', eventId = null) {
  // The community's races, and the official races (common to every community) where it has entries or a crew, or the
  // one asked for (its race channel): only its own entries and crews are shown.
  const events = (await env.DB.prepare(`SELECT id,name,circuit,duration_hours,duration_minutes,event_type,schedule_pending,departures
    FROM events WHERE (community_id=? OR (community_id='official' AND (EXISTS (SELECT 1 FROM registrations r WHERE r.event_id=events.id AND r.community_id=?) OR EXISTS (SELECT 1 FROM event_absences a WHERE a.event_id=events.id AND a.community_id=?)
      OR EXISTS (SELECT 1 FROM crews c WHERE c.event_id=events.id AND c.community_id=?)) OR (community_id='official' AND id=?)))
    AND ${iracingSoloSql(env,community)} ${CIRCUITS[scope] ?? CIRCUITS.lmu} ORDER BY created_at,id`).bind(community.id, community.id, community.id, community.id, eventId).all()).results || [];
  const allDepartures = flattenDepartures(eventId ? events.filter(event => event.id === eventId) : events);
  const currentWeek = parisWeek(timestamp);
  // A start whose time is still to be confirmed is never announced as running (its placeholder is 0:00).
  const currentCandidates = eventId ? [] : allDepartures.filter(item => !item.timePending && item.startsAt <= timestamp && item.endsAt > timestamp);
  // A race channel is titled with the week of the race's next start, not the current week.
  const raceStart = (allDepartures.find(item => item.startsAt > timestamp) || allDepartures[0])?.startsAt ?? timestamp;
  const planning = eventId ? {week:parisWeek(raceStart), futureDepartures:allDepartures} : selectPlanningWeek(allDepartures, timestamp);
  const selected = [...currentCandidates, ...planning.futureDepartures];

  if (!selected.length) {
    return {
      currentDepartures: [],
      futureDepartures: [],
      periodKey: currentWeek.key,
      periodLabel: currentWeek.label
    };
  }

  const selectedByKey = new Map(selected.map(item => [`${item.eventId}:${item.departureId}`, item]));
  const eventIds = [...new Set(selected.map(item => item.eventId))];
  const marks = eventIds.map(() => '?').join(',');

  // Absence is declared for the whole event, not for each departure. Only this community's pilots appear.
  const absenceRows = (await env.DB.prepare(`SELECT a.event_id,u.name FROM event_absences a JOIN users u ON u.id=a.user_id
    WHERE a.event_id IN (${marks}) AND a.community_id=? ORDER BY a.created_at,a.user_id`).bind(...eventIds, community.id).all()).results || [];
  const absentByEvent = new Map();
  for (const row of absenceRows) {
    if (!absentByEvent.has(row.event_id)) absentByEvent.set(row.event_id, []);
    absentByEvent.get(row.event_id).push(String(row.name));
  }
  for (const departure of selected) departure.absentPilots = absentByEvent.get(departure.eventId) || [];

  const registrationRows = (await env.DB.prepare(`SELECT r.id,r.event_id,r.departure_id,r.participant_id,r.category,r.status,
      COALESCE(p.name,r.name) AS pilot_name
    FROM registrations r
    LEFT JOIN participants p ON p.id=r.participant_id
    WHERE r.event_id IN (${marks}) AND r.community_id=? AND COALESCE(r.status,'') <> 'unavailable'
    ORDER BY r.created_at,r.id`).bind(...eventIds, community.id).all()).results || [];

  const registrationsById = new Map();
  for (const row of registrationRows) {
    const departure = selectedByKey.get(`${row.event_id}:${row.departure_id}`);
    if (!departure || !row.id || !row.pilot_name) continue;
    const registration = {
      id:String(row.id),
      participantId:String(row.participant_id || row.id),
      name:String(row.pilot_name),
      category:row.category || ''
    };
    departure.registrations.push(registration);
    registrationsById.set(registration.id, registration);
  }

  const crewRows = (await env.DB.prepare(`SELECT c.id,c.event_id,c.departure_id,c.name,c.category,c.car,c.locked,c.created_at,
      cm.registration_id,COALESCE(p.name,r.name) AS pilot_name,r.created_at AS registration_created_at
    FROM crews c
    LEFT JOIN crew_members cm ON cm.crew_id=c.id
    LEFT JOIN registrations r ON r.id=cm.registration_id
    LEFT JOIN participants p ON p.id=r.participant_id
    WHERE c.event_id IN (${marks}) AND c.community_id=?
    ORDER BY c.created_at,c.id,r.created_at,r.id`).bind(...eventIds, community.id).all()).results || [];

  const crews = new Map();
  const assignedParticipantsByDeparture = new Map();
  for (const row of crewRows) {
    const key = `${row.event_id}:${row.departure_id}`;
    const departure = selectedByKey.get(key);
    if (!departure) continue;
    let crew = crews.get(row.id);
    if (!crew) {
      crew = {id:row.id,name:row.name,category:row.category,car:row.car || '',locked:Boolean(row.locked),pilots:[]};
      crews.set(row.id,crew);
      departure.crews.push(crew);
    }
    if (row.registration_id && row.pilot_name) {
      crew.pilots.push(String(row.pilot_name));
      const registration = registrationsById.get(String(row.registration_id));
      if (registration) {
        if (!assignedParticipantsByDeparture.has(key)) assignedParticipantsByDeparture.set(key,new Set());
        assignedParticipantsByDeparture.get(key).add(registration.participantId);
      }
    }
  }

  for (const departure of selected) {
    const key = `${departure.eventId}:${departure.departureId}`;
    // One pilot per participant, with every category they entered.
    const uniquePilots = new Map();
    for (const registration of departure.registrations) {
      if (!uniquePilots.has(registration.participantId)) uniquePilots.set(registration.participantId, {name:registration.name,categories:[]});
      const pilot = uniquePilots.get(registration.participantId);
      if (registration.category && !pilot.categories.includes(registration.category)) pilot.categories.push(registration.category);
    }
    const assigned = assignedParticipantsByDeparture.get(key) || new Set();
    departure.pilotCount = uniquePilots.size;
    departure.unassignedPilots = [...uniquePilots.entries()]
      .filter(([participantId]) => !assigned.has(participantId))
      .map(([,pilot]) => pilot);
    delete departure.registrations;
  }

  const currentDepartures = currentCandidates
    .map(item => ({...item, crews:item.crews.filter(crew => crew.pilots.length > 0)}))
    .filter(item => item.crews.length > 0);

  return {
    currentDepartures,
    futureDepartures: planning.futureDepartures,
    periodKey: planning.futureDepartures.length ? planning.week.key : currentWeek.key,
    periodLabel: planning.futureDepartures.length ? planning.week.label : currentWeek.label
  };
}

// Mutations and scheduled jobs use the same bot publications in both modes.
// eventId: the race just changed, published first.
export async function syncWeeklyDiscord(env,timestamp=Date.now(),community=null,eventId=null) {
  if (!env?.DB) return {ok:false,skipped:'not-configured'};
  let result={ok:true};
  for (const target of community ? [community] : await allCommunities(env)) {
    if (!await botRecapSettings(env,target)) continue;
    try { result=await syncBotRecaps(env,timestamp,target,false,eventId); }
    catch (error) { result={ok:false,error:error.message};console.error('Discord recap sync failed',target.slug,error.message); }
  }
  return result;
}

export async function syncDueRecaps(env,limit=3,timestamp=Date.now()) {
  if (!env?.DB || limit < 1) return 0;
  const communities=await allCommunities(env);
  const rows=(await env.DB.prepare('SELECT community_id,checked_at FROM community_recap_settings ORDER BY checked_at,community_id').all()).results || [];
  for (const row of rows) {
    const community=communities.find(item=>item.id===row.community_id);
    if (!community) continue;
    // One bot batch uses the remaining invocation budget, including channel cleanup.
    try { await syncBotRecaps(env,timestamp,community);return 1; }
    catch (error) { console.error('Discord recap sync failed',error.message);return 0; }
  }
  return 0;
}

