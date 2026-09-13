import {buildWeeklyDiscordPayload, isDepartureRelevant, nextParisWeek, parisWeek} from './discord-weekly-format.mjs';

const STATE_KEY = 'lmu-weekly-v1';
const LOCK_SECONDS = 90;

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

function departuresForWeek(events, week, timestamp) {
  const departures = [];
  for (const event of events) {
    const eventDepartures = parseJson(event.departures, []);
    if (!Array.isArray(eventDepartures)) continue;
    const durationHours = Number(event.duration_hours) || 0;
    for (const departure of eventDepartures) {
      const startsAt = Number(departure?.startsAt);
      if (!departure?.id || !Number.isFinite(startsAt) || !isDepartureRelevant(startsAt, durationHours, week, timestamp)) continue;
      departures.push({eventId:event.id,eventName:event.name,circuit:event.circuit || '',durationHours,departureId:departure.id,startsAt,crews:[]});
    }
  }
  departures.sort((a,b) => a.startsAt-b.startsAt || a.eventName.localeCompare(b.eventName,'fr'));
  return departures;
}

export async function loadWeeklyDiscordSnapshot(env, timestamp) {
  const currentWeek = parisWeek(timestamp);
  const events = (await env.DB.prepare(`SELECT id,name,circuit,duration_hours,departures
    FROM events WHERE circuit NOT LIKE 'iracing-%' ORDER BY created_at,id`).all()).results || [];

  let week = currentWeek;
  let departures = departuresForWeek(events, week, timestamp);
  if (!departures.length) {
    const followingWeek = nextParisWeek(timestamp);
    const followingDepartures = departuresForWeek(events, followingWeek, timestamp);
    if (followingDepartures.length) {
      week = followingWeek;
      departures = followingDepartures;
    }
  }

  if (!departures.length) return {week,departures};

  const eventIds = [...new Set(departures.map(item => item.eventId))];
  const marks = eventIds.map(() => '?').join(',');
  const rows = (await env.DB.prepare(`SELECT c.id,c.event_id,c.departure_id,c.name,c.category,c.car,c.locked,c.created_at,
      cm.registration_id,COALESCE(p.name,r.name) AS pilot_name,r.created_at AS registration_created_at
    FROM crews c
    LEFT JOIN crew_members cm ON cm.crew_id=c.id
    LEFT JOIN registrations r ON r.id=cm.registration_id
    LEFT JOIN participants p ON p.id=r.participant_id
    WHERE c.event_id IN (${marks})
    ORDER BY c.created_at,c.id,r.created_at,r.id`).bind(...eventIds).all()).results || [];
  const crews = new Map();
  const byDeparture = new Map();
  for (const row of rows) {
    let crew = crews.get(row.id);
    if (!crew) {
      crew = {id:row.id,name:row.name,category:row.category,car:row.car || '',locked:Boolean(row.locked),pilots:[]};
      crews.set(row.id,crew);
      const key = `${row.event_id}:${row.departure_id}`;
      if (!byDeparture.has(key)) byDeparture.set(key,[]);
      byDeparture.get(key).push(crew);
    }
    if (row.registration_id && row.pilot_name) crew.pilots.push(String(row.pilot_name));
  }
  for (const departure of departures) departure.crews = byDeparture.get(`${departure.eventId}:${departure.departureId}`) || [];
  return {week,departures};
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
    .bind(messageId,contentHash,snapshot.week.key,Math.floor(Date.now()/1000),STATE_KEY,lockToken).run();
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
