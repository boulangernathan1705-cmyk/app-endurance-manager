import {buildWeeklyDiscordPayload, isInParisWeek, parisWeek} from './discord-weekly-format.mjs';

const STATE_KEY = 'lmu-weekly-v1'; // Conservé pour réutiliser le message Discord existant.
const LOCK_SECONDS = 90;
const HOUR_MS = 3_600_000;

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function appUrl(env) {
  try { return `${new URL(env.APP_ORIGIN).origin}/lmu/`; } catch { return undefined; }
}

async function hashSnapshot(snapshot) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function flattenDepartures(events) {
  const departures = [];
  for (const event of events) {
    const eventDepartures = parseJson(event.departures, []);
    if (!Array.isArray(eventDepartures)) continue;
    const durationHours = Number(event.duration_hours) || 0;
    for (const departure of eventDepartures) {
      const startsAt = Number(departure?.startsAt);
      if (!departure?.id || !Number.isFinite(startsAt)) continue;
      departures.push({
        eventId: event.id,
        eventName: event.name,
        circuit: event.circuit || '',
        durationHours,
        departureId: departure.id,
        startsAt,
        endsAt: startsAt + durationHours * HOUR_MS,
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

export async function loadWeeklyDiscordSnapshot(env, timestamp) {
  const events = (await env.DB.prepare(`SELECT id,name,circuit,duration_hours,departures
    FROM events WHERE circuit NOT LIKE 'iracing-%' ORDER BY created_at,id`).all()).results || [];
  const allDepartures = flattenDepartures(events);
  const currentWeek = parisWeek(timestamp);
  const currentCandidates = allDepartures.filter(item => item.startsAt <= timestamp && item.endsAt > timestamp);
  const planning = selectPlanningWeek(allDepartures, timestamp);
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

  // Le récap Discord historique reste le planning général du site. Les espaces privés
  // Team/communauté ne doivent jamais être exposés dans ce webhook partagé.
  const registrationRows = (await env.DB.prepare(`SELECT r.id,r.event_id,r.departure_id,r.participant_id,r.category,r.status,
      COALESCE(p.name,r.name) AS pilot_name
    FROM registrations r
    LEFT JOIN participants p ON p.id=r.participant_id
    WHERE r.event_id IN (${marks}) AND r.organization_id IS NULL AND COALESCE(r.status,'') <> 'unavailable'
    ORDER BY r.created_at,r.id`).bind(...eventIds).all()).results || [];

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
    WHERE c.event_id IN (${marks}) AND c.organization_id IS NULL
    ORDER BY c.created_at,c.id,r.created_at,r.id`).bind(...eventIds).all()).results || [];

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
    const uniquePilots = new Map();
    for (const registration of departure.registrations) {
      if (!uniquePilots.has(registration.participantId)) uniquePilots.set(registration.participantId, registration.name);
    }
    const assigned = assignedParticipantsByDeparture.get(key) || new Set();
    departure.pilotCount = uniquePilots.size;
    departure.unassignedPilots = [...uniquePilots.entries()]
      .filter(([participantId]) => !assigned.has(participantId))
      .map(([,name]) => name);
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

async function sendDiscord(url, method, payload) {
  const response = await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
  let data = null;
  if (response.status !== 204) { try { data = await response.json(); } catch {} }
  if (!response.ok) { const error = new Error(`Discord weekly HTTP ${response.status}`); error.status=response.status; throw error; }
  return data;
}

async function createMessage(base,payload) {
  const url = new URL(base);
  url.searchParams.set('wait','true');
  const message = await sendDiscord(url.toString(),'POST',payload);
  if (!/^\d{15,22}$/.test(String(message?.id || ''))) throw new Error('Identifiant du message Discord absent.');
  return String(message.id);
}

async function editMessage(base,messageId,payload) {
  try { await sendDiscord(`${base}/messages/${encodeURIComponent(messageId)}`,'PATCH',payload); return messageId; }
  catch (error) { if (error?.status !== 404) throw error; return createMessage(base,payload); }
}

async function syncLocked(env,base,lockToken,timestamp) {
  const snapshot = await loadWeeklyDiscordSnapshot(env,timestamp);
  const contentHash = await hashSnapshot(snapshot);
  const state = await env.DB.prepare('SELECT message_id,content_hash FROM discord_weekly_state WHERE key=? AND lock_token=?').bind(STATE_KEY,lockToken).first();
  if (!state) throw new Error('État Discord hebdomadaire indisponible.');
  if (state.message_id && state.content_hash === contentHash) return {ok:true,changed:false};
  const payload = buildWeeklyDiscordPayload(snapshot,appUrl(env),timestamp);
  const messageId = state.message_id ? await editMessage(base,state.message_id,payload) : await createMessage(base,payload);
  await env.DB.prepare('UPDATE discord_weekly_state SET message_id=?,content_hash=?,week_key=?,updated_at=? WHERE key=? AND lock_token=?')
    .bind(messageId,contentHash,snapshot.periodKey,Math.floor(Date.now()/1000),STATE_KEY,lockToken).run();
  return {ok:true,changed:true,messageId};
}

export async function syncWeeklyDiscord(env,timestamp=Date.now()) {
  const base = String(env?.DISCORD_WEEKLY_WEBHOOK_URL || '').trim();
  if (!env?.DB || !base) return {ok:false,skipped:'not-configured'};
  const now = Math.floor(Date.now()/1000);
  await env.DB.prepare(`INSERT OR IGNORE INTO discord_weekly_state
    (key,message_id,content_hash,week_key,updated_at,dirty,lock_token,lock_until) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(STATE_KEY,'','','',0,0,'',0).run();
  await env.DB.prepare('UPDATE discord_weekly_state SET dirty=1 WHERE key=?').bind(STATE_KEY).run();
  const lockToken = crypto.randomUUID();
  const lock = await env.DB.prepare("UPDATE discord_weekly_state SET lock_token=?,lock_until=? WHERE key=? AND (lock_token='' OR lock_until<?)")
    .bind(lockToken,now+LOCK_SECONDS,STATE_KEY,now).run();
  if (!lock.meta.changes) return {ok:true,queued:true};
  let result={ok:true,changed:false};
  let rerun=false;
  try {
    for (let attempt=0; attempt<5; attempt+=1) {
      await env.DB.prepare('UPDATE discord_weekly_state SET dirty=0 WHERE key=? AND lock_token=?').bind(STATE_KEY,lockToken).run();
      result=await syncLocked(env,base,lockToken,timestamp);
      const state=await env.DB.prepare('SELECT dirty FROM discord_weekly_state WHERE key=? AND lock_token=?').bind(STATE_KEY,lockToken).first();
      if (!state?.dirty) break;
      if (attempt===4) rerun=true;
    }
  } catch (error) {
    await env.DB.prepare('UPDATE discord_weekly_state SET dirty=1 WHERE key=? AND lock_token=?').bind(STATE_KEY,lockToken).run().catch(()=>{});
    throw error;
  } finally {
    await env.DB.prepare("UPDATE discord_weekly_state SET lock_token='',lock_until=0 WHERE key=? AND lock_token=?").bind(STATE_KEY,lockToken).run().catch(()=>{});
  }
  return rerun ? syncWeeklyDiscord(env,Date.now()) : result;
}
