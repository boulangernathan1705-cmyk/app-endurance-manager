import {iracingSoloSql} from './iracing-visibility.mjs';
import {allCommunities, communityUrl, appearanceOf} from './community.mjs';
import {CALENDAR_FORMAT, isInParisWeek, parisWeek, lastWeekTurn, parisDay} from './discord-weekly-format.mjs';
import {simForEvent} from '../shared/catalog.mjs';
import {raceFinishAt} from '../shared/duration.mjs';
import {grindfestEnabled} from '../shared/grindfest.mjs';
import {isDevelopment} from './dev-environment.mjs';
import {isStream, streamDetails, streamDuringEndurance, streamIsRace, isEnduranceTwin} from '../shared/stream.mjs';
import {streamCrew} from './stream-crew.mjs';
import {parseLayout} from './discord-layout.mjs';
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
    const details = parseJson(event.details, {}) || {};
    const durationHours = Number(event.duration_hours) || 0, durationMinutes = Number(event.duration_minutes) || durationHours * 60;
    for (const departure of eventDepartures) {
      const startsAt = Number(departure?.startsAt);
      if (!departure?.id || !Number.isFinite(startsAt)) continue;
      departures.push({
        eventId: event.id,
        eventName: event.name,
        eventType: event.event_type || '',
        // The race's conditions (weather, tyres, track limits…), on its thread's card.
        details,
        circuit: event.circuit || '',
        durationHours,
        durationMinutes,
        departureId: departure.id,
        // "Horaires à confirmer": the time of the start is only a placeholder.
        timePending: Boolean(event.schedule_pending) || departure.tbd === true,
        startsAt,
        endsAt: raceFinishAt(startsAt, durationMinutes),
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
  // The community's races, the official LMU races (each has its category on the server, as server/recap-discord.mjs
  // openRaces), the official iRacing ones (all of them when the community shows them on its site, otherwise those where it
  // has entries or a crew), or the one asked for (its race channel): only its
  // own entries and crews are shown.
  const events = (await env.DB.prepare(`SELECT id,name,circuit,duration_hours,duration_minutes,event_type,schedule_pending,departures,details
    FROM events WHERE (community_id=? OR (community_id='official' AND (${community.modules?.iracingImport === true ? "1 OR " : ''}circuit NOT LIKE 'iracing-%' OR EXISTS (SELECT 1 FROM registrations r WHERE r.event_id=events.id AND r.community_id=?) OR EXISTS (SELECT 1 FROM event_absences a WHERE a.event_id=events.id AND a.community_id=?)
      OR EXISTS (SELECT 1 FROM crews c WHERE c.event_id=events.id AND c.community_id=?)) OR (community_id='official' AND id=?)))
    AND COALESCE(format,'endurance')<>'solo' AND ${iracingSoloSql(env,community)} ${CIRCUITS[scope] ?? CIRCUITS.lmu} ORDER BY created_at,id`).bind(community.id, community.id, community.id, community.id, eventId).all()).results || [];
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

const CALENDAR_TURN_MS = 7.5 * 3600000;
const nameKey = value => String(value || '').trim().toLowerCase();

// The endurances of the community's streamer in the calendar (Nathan, 2026-11-03): each start where he is in a crew of
// this community (his name on the site = « Nom du streamer » of Admin > Discord), or where an admin streams it
// (« Je streame ce départ »), with that crew and the stream's times and link.
async function streamerEndurances(env, community, timestamp) {
  const layout = parseLayout((await env.DB.prepare('SELECT layout FROM community_recap_settings WHERE community_id=?').bind(community.id).first())?.layout) || {};
  const streamer = nameKey(layout.streamName);
  const regs = (await env.DB.prepare(`SELECT r.event_id,r.departure_id,r.stream_time,r.stream_end,COALESCE(p.name,r.name) AS pilot,cm.crew_id,
      e.name,e.circuit,e.departures,e.schedule_pending,e.duration_minutes
    FROM registrations r JOIN events e ON e.id=r.event_id LEFT JOIN participants p ON p.id=r.participant_id
    LEFT JOIN crew_members cm ON cm.registration_id=r.id
    WHERE r.community_id=? AND COALESCE(e.format,'endurance')<>'solo' AND COALESCE(r.status,'')<>'unavailable'
      AND (COALESCE(r.stream_time,'')<>'' OR (?<>'' AND lower(trim(COALESCE(p.name,r.name)))=?))
      AND EXISTS (SELECT 1 FROM json_each(e.departures) d WHERE json_extract(d.value,'$.id')=r.departure_id AND json_extract(d.value,'$.startsAt')>=?)
    ORDER BY r.created_at,r.id`).bind(community.id, streamer, streamer, timestamp - 8 * 86400000).all()).results || [];
  const byStart = new Map();
  for (const reg of regs) {
    const start = parseJson(reg.departures, []).find(item => item?.id === reg.departure_id);
    if (!Number.isFinite(Number(start?.startsAt))) continue;
    const key = `${reg.event_id}:${reg.departure_id}`;
    const item = byStart.get(key) || {row:{id:reg.event_id, name:reg.name, circuit:reg.circuit || '', schedule_pending:reg.schedule_pending}, start, startsAt:Number(start.startsAt),
      endsAt:Number(start.startsAt) + (Number(reg.duration_minutes) || 0) * 60000,
      endurance:{sim:String(reg.circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu', info:{crew:null, streamTime:'', streamEnd:'', streamUrl:layout.stream || ''}}, crewId:null, streamerCrew:false};
    if (reg.stream_time && !item.endurance.info.streamTime) Object.assign(item.endurance.info, {streamTime:reg.stream_time, streamEnd:reg.stream_end || ''});
    // The streamer's own crew first, else the crew of the admin who streams it.
    const own = streamer && nameKey(reg.pilot) === streamer;
    if (reg.crew_id && (!item.crewId || (own && !item.streamerCrew))) { item.crewId = reg.crew_id; item.streamerCrew = own; }
    byStart.set(key, item);
  }
  for (const item of byStart.values()) {
    if (!item.crewId) continue;
    const crew = await env.DB.prepare('SELECT name FROM crews WHERE id=?').bind(item.crewId).first();
    const pilots = (await env.DB.prepare(`SELECT COALESCE(p.name,r.name) AS name FROM crew_members cm JOIN registrations r ON r.id=cm.registration_id
      LEFT JOIN participants p ON p.id=r.participant_id WHERE cm.crew_id=? ORDER BY r.created_at,r.id`).bind(item.crewId).all()).results || [];
    if (crew) item.endurance.info.crew = {name:String(crew.name), pilots:pilots.map(pilot => String(pilot.name)).filter(Boolean)};
  }
  return [...byStart.values()].map(({crewId, streamerCrew, ...item}) => item);
}

// The calendar's events (EVENT SOLO / EVENT TDZ) of the week, with their places taken by this community's pilots.
// sim: 'iracing' for the iRacing events only, 'lmu' for all the others (null: all).
export async function loadCalendarSnapshot(env, timestamp, community, sim = null) {
  const rows = (await env.DB.prepare(`SELECT id,name,sim,circuit,rounds,capacity,access,departures,schedule_pending,details,created_by FROM events
    WHERE (community_id=? OR community_id='official') AND format='solo' AND ${iracingSoloSql(env,community)}
    ${grindfestEnabled(community, isDevelopment(env)) ? '' : "AND COALESCE(json_extract(details,'$.type'),'') NOT IN ('Gridfest','Grindfest')"}
    ORDER BY created_at,id`).bind(community.id).all()).results || [];
  // A stream goes with the sim of its race.
  const simOf = row => isStream(row) ? streamDetails({details:parseJson(row.details, {})}).raceSim || 'stream' : simForEvent(row);
  const starts = rows.filter(row => !sim || (simOf(row) === 'iracing') === (sim === 'iracing')).flatMap(row => parseJson(row.departures, []).filter(start => Number.isFinite(Number(start?.startsAt)))
    .map(start => ({row, start, startsAt:Number(start.startsAt)})));
  const endurances = await streamerEndurances(env, community, timestamp);
  // A stream announced during a streamed endurance start is that endurance's stream: shown once (Nathan, 2026-11-08).
  const streamed = endurances.filter(item => item.endurance.info.streamTime);
  // An event of the calendar for the same race as one of these endurances (same name, same start): told once, by the endurance.
  const sameRace = item => !isStream(item.row) && endurances.some(endu => isEnduranceTwin({name:item.row.name, startsAt:item.startsAt}, {name:endu.row.name, startsAt:endu.startsAt}));
  for (let index = starts.length - 1; index >= 0; index--) if (sameRace(starts[index])) starts.splice(index, 1);
  const link = (parseLayout((await env.DB.prepare('SELECT layout FROM community_recap_settings WHERE community_id=?').bind(community.id).first())?.layout) || {}).stream || '';
  const crews = new Map();
  for (let index = starts.length - 1; index >= 0; index--) {
    const {row, startsAt} = starts[index];
    if (!isStream(row)) continue;
    if (streamDuringEndurance(startsAt, streamed)) { starts.splice(index, 1); continue; }
    // The streamer's own endurance that day (his crew in it): the stream goes into its entry (Nathan, 2026-11-11).
    const crew = await streamCrew(env, community.id, row);
    const own = crew && endurances.find(item => item.row.id === crew.eventId && parisDay(item.startsAt) === parisDay(startsAt));
    const details = streamDetails({details:parseJson(row.details, {})});
    if (!own) {
      // A stream of an event of the calendar (a race): the same race, told once, with its stream (Nathan, 2026-11-11).
      const race = starts.find(item => !isStream(item.row) && !item.streamed
        && streamIsRace({name:row.name, startsAt, time:starts[index].start.time, raceSim:details.raceSim, raceTime:details.raceTime}, {name:item.row.name, sim:simForEvent(item.row), startsAt:item.startsAt}));
      if (!race) { crews.set(row.id, crew); continue; }
      race.streamed = {time:details.streamTime || details.raceTime || '', url:details.streamUrl || link};
      starts.splice(index, 1);
      continue;
    }
    if (!own.endurance.info.streamTime) own.endurance.info.streamTime = details.streamTime || details.raceTime || '';
    if (details.streamUrl && !own.endurance.info.streamUrl) own.endurance.info.streamUrl = details.streamUrl;
    starts.splice(index, 1);
  }
  starts.push(...endurances.filter(item => !sim || (item.endurance.sim === 'iracing') === (sim === 'iracing')));
  // The calendar's week turns on Monday at 7h30, with the morning announcement (Nathan, 2026-11-01):
  // once its events are over, the week stays shown until then.
  const currentWeek = parisWeek(timestamp - CALENDAR_TURN_MS);
  const thisWeek = starts.filter(item => isInParisWeek(item.startsAt, currentWeek));
  let week = currentWeek, selected = thisWeek.filter(item => item.startsAt > timestamp);
  if (!selected.length && thisWeek.length) selected = thisWeek;
  if (!selected.length) {
    const next = starts.filter(item => item.startsAt > timestamp).sort((a,b) => a.startsAt - b.startsAt)[0];
    if (next) { week = parisWeek(next.startsAt); selected = starts.filter(item => item.startsAt > timestamp && isInParisWeek(item.startsAt, week)); }
  }
  selected.sort((a,b) => a.startsAt - b.startsAt || String(a.row.name).localeCompare(String(b.row.name),'fr'));
  const ids = [...new Set(selected.filter(item => !item.endurance).map(item => item.row.id))];
  const counts = new Map();
  if (ids.length) {
    const result = (await env.DB.prepare(`SELECT event_id,departure_id,COUNT(DISTINCT COALESCE(participant_id,id)) AS entered FROM registrations
      WHERE event_id IN (${ids.map(() => '?').join(',')}) AND community_id=? AND COALESCE(status,'')<>'unavailable' GROUP BY event_id,departure_id`)
      .bind(...ids, community.id).all()).results || [];
    for (const row of result) counts.set(`${row.event_id}:${row.departure_id}`, Number(row.entered) || 0);
  }
  for (const {row} of selected) if (isStream(row) && !crews.has(row.id)) crews.set(row.id, await streamCrew(env, community.id, row));
  return {periodKey:week.key, periodLabel:week.label, events:selected.map(({row, start, startsAt, endurance, streamed}) => {
    if (endurance) return {id:row.id, name:row.name, sim:endurance.sim, circuits:[row.circuit], startsAt, timePending:Boolean(row.schedule_pending) || start.tbd === true, endurance:endurance.info};
    const rounds = parseJson(row.rounds, []);
    return {id:row.id, name:row.name, sim:simForEvent(row), circuits:rounds.length ? rounds.map(round => round?.circuit) : [row.circuit],
      startsAt, timePending:Boolean(row.schedule_pending) || start.tbd === true, capacity:row.capacity == null ? null : Number(row.capacity),
      entered:counts.get(`${row.id}:${start.id}`) || 0, access:row.access || '',
      // A streamed event: the stream it was announced with, or the stream time given on the event.
      ...(streamed || parseJson(row.details, {})?.streamTime ? {streamed:streamed || {time:parseJson(row.details, {}).streamTime, url:link}} : {}),
      ...(isStream(row) ? {stream:{...streamDetails({details:parseJson(row.details, {})}), crew:crews.get(row.id) || null}} : {})};
  })};
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

// pending: only a community with work left from its last pass (a new setting takes several), never one in error.
// then: what follows the pass for that community (its crews' voices).
export async function syncDueRecaps(env,limit=3,timestamp=Date.now(),{pending=false,then=null}={}) {
  if (!env?.DB || limit < 1) return 0;
  // Pending: a change on the site (dirty), an old calendar format, or a community not looked at since the week turned
  // (Monday 7h30, Paris): its calendar, week messages and finished race threads change with the time alone, not with a
  // change on the site, so they would otherwise wait for its hourly turn (up to 4 hours with 4 communities, 2026-11-02).
  const statement=env.DB.prepare(`SELECT community_id,checked_at FROM community_recap_settings ${pending ? `WHERE last_error IS NULL AND (dirty=1 OR (enabled=1 AND checked_at<?) OR (enabled=1 AND EXISTS (SELECT 1 FROM discord_recap_publications p WHERE p.community_id=community_recap_settings.community_id AND p.closed_at IS NULL AND p.event_id LIKE 'week:calendar%' AND p.message_id IS NOT NULL AND p.content_hash NOT LIKE '${CALENDAR_FORMAT}%')))` : ''} ORDER BY checked_at,community_id`);
  const rows=(await (pending ? statement.bind(lastWeekTurn(timestamp)) : statement).all()).results || [];
  if (!rows.length) return 0;
  const communities=await allCommunities(env);
  for (const row of rows) {
    const community=communities.find(item=>item.id===row.community_id);
    if (!community) continue;
    // One bot batch uses the remaining invocation budget, including channel cleanup.
    try { await syncBotRecaps(env,timestamp,community);if(then)await then(community);return 1; }
    catch (error) { console.error('Discord recap sync failed',error.message);return 0; }
  }
  return 0;
}

