import {allCommunities, communityUrl, communitySlug} from './community.mjs';
import {buildWeeklyDiscordPayload, isInParisWeek, parisWeek} from './discord-weekly-format.mjs';

// The recap messages of a community (community_recaps, set on its « Mise en place » page): one message per
// row, for one simulator or both. Each message has its state key "<community id>:<scope>-weekly-v1"
// (migration 0034 kept the existing LMU message of commu-dev under "<id>:lmu-weekly-v1").
const stateKey = (community, scope = 'lmu') => `${community.id}:${scope}-weekly-v1`;
const LOCK_SECONDS = 90;
export const WEBHOOK_URL = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{15,22}\/[\w-]{20,120}$/;
const CIRCUITS = {all:'', lmu:"AND circuit NOT LIKE 'iracing-%'", iracing:"AND circuit LIKE 'iracing-%'"};
const PAGES = {all:'/', lmu:'/lmu/', iracing:'/iracing/'};

// The former recap (LMU races, through the site's webhook DISCORD_WEEKLY_WEBHOOK_URL) only belongs to the
// community of the main address: no other community can ever post into that channel.
export const usesSiteRecap = (env, community) => community.slug === communitySlug(env, null) && community.modules?.discordWeekly === true
  && Boolean(String(env.DISCORD_WEEKLY_WEBHOOK_URL || '').trim());

// Recap messages to keep up to date: those set on the « Mise en place » page, or else the former one.
export async function recapTargets(env, community) {
  const rows = (await env.DB.prepare('SELECT scope, webhook_url FROM community_recaps WHERE community_id=? ORDER BY scope').bind(community.id).all()).results || [];
  if (rows.length) return rows.map(row => ({scope:row.scope, url:row.webhook_url}));
  return usesSiteRecap(env, community) ? [{scope:'lmu', url:String(env.DISCORD_WEEKLY_WEBHOOK_URL).trim()}] : [];
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function appUrl(env, community, scope) {
  try { return `${communityUrl(env, community)}${PAGES[scope] || '/'}`; } catch { return undefined; }
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
    const durationHours = Number(event.duration_hours) || 0, durationMinutes = Number(event.duration_minutes) || durationHours * 60;
    for (const departure of eventDepartures) {
      const startsAt = Number(departure?.startsAt);
      if (!departure?.id || !Number.isFinite(startsAt)) continue;
      departures.push({
        eventId: event.id,
        eventName: event.name,
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

export async function loadWeeklyDiscordSnapshot(env, timestamp, community, scope = 'lmu') {
  const events = (await env.DB.prepare(`SELECT id,name,circuit,duration_hours,duration_minutes,schedule_pending,departures
    FROM events WHERE community_id=? ${CIRCUITS[scope] ?? CIRCUITS.lmu} ORDER BY created_at,id`).bind(community.id).all()).results || [];
  const allDepartures = flattenDepartures(events);
  const currentWeek = parisWeek(timestamp);
  // A start whose time is still to be confirmed is never announced as running (its placeholder is 0:00).
  const currentCandidates = allDepartures.filter(item => !item.timePending && item.startsAt <= timestamp && item.endsAt > timestamp);
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

  const registrationRows = (await env.DB.prepare(`SELECT r.id,r.event_id,r.departure_id,r.participant_id,r.category,r.status,
      COALESCE(p.name,r.name) AS pilot_name
    FROM registrations r
    LEFT JOIN participants p ON p.id=r.participant_id
    WHERE r.event_id IN (${marks}) AND COALESCE(r.status,'') <> 'unavailable'
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
    WHERE c.event_id IN (${marks})
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

async function syncLocked(env,base,lockToken,timestamp,community,scope) {
  const STATE_KEY = stateKey(community, scope);
  const snapshot = await loadWeeklyDiscordSnapshot(env,timestamp,community,scope);
  const contentHash = await hashSnapshot(snapshot);
  const state = await env.DB.prepare('SELECT message_id,content_hash FROM discord_weekly_state WHERE key=? AND lock_token=?').bind(STATE_KEY,lockToken).first();
  if (!state) throw new Error('État Discord hebdomadaire indisponible.');
  if (state.message_id && state.content_hash === contentHash) return {ok:true,changed:false};
  const payload = buildWeeklyDiscordPayload(snapshot,appUrl(env,community,scope),timestamp,scope);
  const messageId = state.message_id ? await editMessage(base,state.message_id,payload) : await createMessage(base,payload);
  await env.DB.prepare('UPDATE discord_weekly_state SET message_id=?,content_hash=?,week_key=?,updated_at=? WHERE key=? AND lock_token=?')
    .bind(messageId,contentHash,snapshot.periodKey,Math.floor(Date.now()/1000),STATE_KEY,lockToken).run();
  return {ok:true,changed:true,messageId};
}

// Keeps the recap messages up to date: those of one community, or of every community (scheduled task).
export async function syncWeeklyDiscord(env,timestamp=Date.now(),community=null) {
  if (!env?.DB) return {ok:false,skipped:'not-configured'};
  let last={ok:false,skipped:'not-configured'}, failed=null;
  for (const target of community ? [community] : await allCommunities(env)) {
    for (const recap of await recapTargets(env,target)) {
      try { last=await syncRecap(env,timestamp,target,recap.scope,recap.url); }
      // One broken webhook (deleted on Discord) never stops the other messages.
      catch (error) { failed={ok:false,error:error?.status || 'failed'}; console.error('Discord weekly sync failed', target.slug, recap.scope, error instanceof Error ? error.message : 'unknown'); }
    }
  }
  return failed || last;
}

async function syncRecap(env,timestamp,community,scope,base) {
  const STATE_KEY = stateKey(community, scope);
  const now = Math.floor(Date.now()/1000);
  await env.DB.prepare(`INSERT OR IGNORE INTO discord_weekly_state
    (key,message_id,content_hash,week_key,updated_at,dirty,lock_token,lock_until,community_id) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(STATE_KEY,'','','',0,0,'',0,community.id).run();
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
      result=await syncLocked(env,base,lockToken,timestamp,community,scope);
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
  return rerun ? syncRecap(env,Date.now(),community,scope,base) : result;
}

// « Tester » on the setup page: a short message in the channel of the webhook. Throws when Discord refuses it.
export async function sendRecapTest(url, community) {
  if (!WEBHOOK_URL.test(url)) { const error = new Error('bad-url'); error.status = 400; throw error; }
  const name = String(community.name || '').replace(/[^\p{L}\p{N} '’.-]/gu, '').trim() || 'ta communauté';
  const content = '✅ Ce salon est bien relié à **' + name + '** sur Endurance Manager. Le récap des courses de la semaine sera publié ici.';
  await sendDiscord(url, 'POST', {content, allowed_mentions:{parse:[]}});
}
