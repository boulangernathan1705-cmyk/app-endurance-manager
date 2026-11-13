// At 7h30 (Paris), ONE message (Nathan, 2026-11-13: « ça me plaît pas d'avoir 2 annonces »): the stream of the day on
// top, with the races it streams, then « Aussi aujourd'hui » with the day's other endurances and events. It pings
// @everyone with a stream, otherwise it is a plain message alert. Older layouts are replaced without a ping.
import {communityById} from './community.mjs';
import {iracingSoloSql} from './iracing-visibility.mjs';
import {loadWeeklyDiscordSnapshot, siteOf} from './discord-weekly.mjs';
import {buildAnnounceIntro, buildAnnounceEvent, buildAnnounceRace, buildAnnounceStream, parisDay, raceUrl} from './discord-weekly-format.mjs';
import {posterModel, posterHtml, posterText, renderPoster} from './discord-poster.mjs';
import {discordRequest, botCategoryEmojis} from './recap-discord.mjs';
import {discordAbsentButton} from './discord-interactions.mjs';
import {parseLayout} from './discord-layout.mjs';
import {simForEvent, tdzOnly, normalizeTdzEventType, eventLogoName, isTrainingType} from '../shared/catalog.mjs';
import {grindfestEnabled, isGrindfest, streamersOf} from '../shared/grindfest.mjs';
import {isDevelopment} from './dev-environment.mjs';
import {isStream, streamDetails, streamDuringEndurance, streamIsRace} from '../shared/stream.mjs';
import {streamCrew} from './stream-crew.mjs';

const MINUTE = 60000, HOUR = 60 * MINUTE;
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
// Only the first morning evaluation can ping (7h30–9h Paris). Later publications are silent.
const FROM = 7 * 60 + 30, UNTIL = 9 * 60;
// A small Discord budget also bounds cleanup of legacy separate messages.
const REQUESTS = 7, REFRESH_EVERY = 10 * MINUTE;
const parisMinutes = timestamp => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Paris', hour:'numeric', minute:'numeric', hourCycle:'h23'}).formatToParts(timestamp).map(part => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
};
const parse = (value, fallback) => { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } };
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
// The update time in the footer changes on every pass: not part of what is compared.
// A new prefix leaves a day announced by an older layout as it is until midnight (publishAnnouncement).
const PREFIX = 'one-v1:';
const contentHash = async payload => PREFIX + await digest({...payload, embeds:(payload.embeds || []).map(({footer, ...embed}) => embed)});

// The channel chosen for the announcement, or '' (layout.announce).
export const announceChannel = settings => settings?.enabled === 0 ? '' : String(parseLayout(settings?.layout)?.announce || '');
// The community's stream, linked in the intro of the announcement, or '' (layout.stream).
export const announceStream = settings => String(parseLayout(settings?.layout)?.stream || '');

const SOLO_SQL = (env, community) => `(community_id=? OR community_id='official') AND format='solo' AND ${iracingSoloSql(env, community)}
  ${grindfestEnabled(community, isDevelopment(env)) ? '' : "AND COALESCE(json_extract(details,'$.type'),'') NOT IN ('Gridfest','Grindfest')"}`;
// A start of today, started or not: the announcement keeps the whole day (Nathan's rule).
const today = (start, day) => Number.isFinite(Number(start?.startsAt)) && parisDay(Number(start.startsAt)) === day;
// Midnight (Paris) of the day of the timestamp: the week's snapshot read from there still holds the day's started races.
export function parisDayStart(timestamp) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Paris', year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', second:'numeric', hourCycle:'h23'})
    .formatToParts(timestamp).map(part => [part.type, Number(part.value)]));
  const offset = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(timestamp / 1000) * 1000;
  let start = Date.UTC(parts.year, parts.month - 1, parts.day) - offset;
  // The offset may change during the night (summer time): step to the true first moment of the day.
  const day = parisDay(timestamp);
  while (parisDay(start - 1) === day) start -= 3600000;
  while (parisDay(start) !== day) start += 3600000;
  return start - 1;
}

// The day's races of a community, in the order of their first start today: [{item, kind:'event'|'race', startsAt}].
export async function announceItems(env, community, timestamp) {
  const day = parisDay(timestamp), items = [];
  const solo = (await env.DB.prepare(`SELECT id,sim,departures,schedule_pending,details FROM events WHERE ${SOLO_SQL(env, community)}`).bind(community.id).all()).results || [];
  const registrations = (await env.DB.prepare(`SELECT event_id,departure_id FROM registrations
    WHERE community_id=? AND COALESCE(status,'')<>'unavailable' GROUP BY event_id,departure_id`).bind(community.id).all()).results || [];
  for (const row of solo) {
    const starts = parse(row.departures, []).filter(start => today(start, day)
      && (isStream(row) || announcedEmpty(row) || registrations.some(entry => entry.event_id === row.id && entry.departure_id === start.id)));
    // A stream (« Annoncer un stream ») has its own card, without « Présent » nor « Absent ».
    if (starts.length) items.push({item:row.id, kind:isStream(row) ? 'stream' : 'event', startsAt:Math.min(...starts.map(start => Number(start.startsAt)))});
  }
  // The endurances as in the week's message (official LMU ones included, iRacing ones as the community shows them).
  const snapshot = await loadWeeklyDiscordSnapshot(env, parisDayStart(timestamp), community, 'all');
  // Only the starts with a crew: the announcement puts forward who is sure to race that day (Nathan, 2026-11-01).
  // A start an admin streams (« Je streame ce départ ») is announced with or without a crew.
  const streamed = await streamedStarts(env, community);
  for (const departure of snapshot.futureDepartures.filter(item => parisDay(item.startsAt) === day && (crewed(item) || streamed.has(item.departureId)))) {
    const known = items.find(item => item.item === departure.eventId);
    if (!known) items.push({item:departure.eventId, kind:'race', startsAt:departure.startsAt});
  }
  return items.sort((a, b) => a.startsAt - b.startsAt || a.item.localeCompare(b.item));
}

// A streamed event or a training is announced even before its first entry: people need to know (Nathan 2026-11-02).
const announcedEmpty = row => { const details = parse(row.details, {}) || {}; return Boolean(details.streamTime) || isTrainingType(details.type); };
// An event of the calendar as announced: its rounds, its places and this community's entries for today's start.
async function eventSnapshot(env, community, id, timestamp) {
  const row = await env.DB.prepare(`SELECT id,name,sim,circuit,rounds,capacity,access,details,departures,schedule_pending,created_by FROM events WHERE id=? AND ${SOLO_SQL(env, community)}`)
    .bind(id, community.id).first();
  if (!row) return null;
  const day = parisDay(timestamp);
  const entries = isStream(row) ? [] : (await env.DB.prepare(`SELECT departure_id,streamer_id,COUNT(DISTINCT COALESCE(participant_id,id)) AS entered FROM registrations
    WHERE event_id=? AND community_id=? AND COALESCE(status,'')<>'unavailable' GROUP BY departure_id,streamer_id`).bind(row.id, community.id).all()).results || [];
  const start = parse(row.departures, []).find(item => today(item, day)
    && (isStream(row) || announcedEmpty(row) || entries.some(entry => entry.departure_id === item.id)));
  if (!start) return null;
  const details = parse(row.details, {}) || {}, sim = simForEvent(row), tdz = tdzOnly(community, isDevelopment(env));
  if (isStream(row)) return {id:row.id, name:row.name, startsAt:Number(start.startsAt), time:start.time || '', stream:{...streamDetails({details}), crew:await streamCrew(env, community.id, row)}};
  const startEntries = entries.filter(entry => entry.departure_id === start.id);
  const entered = startEntries.reduce((total, item) => total + Number(item.entered || 0), 0);
  if (!entered && !announcedEmpty(row)) return null;
  const gridfest = isGrindfest(row), site = siteOf(env, community).url || '';
  return {id:row.id, name:row.name, sim, type:normalizeTdzEventType(details.type) || '', access:tdz ? row.access || 'open' : '', tdz, note:details.note || '',
    startsAt:Number(start.startsAt), timePending:Boolean(row.schedule_pending) || start.tbd === true,
    training:isTrainingType(details.type), rounds:parse(row.rounds, []), capacity:row.capacity == null ? null : Number(row.capacity), entered,
    streamers:gridfest ? streamersOf(row).map(streamer => ({name:streamer.name, twitchUrl:streamer.twitchUrl, logoUrl:streamer.logoUrl || '', capacity:streamer.capacity, entered:Number(startEntries.find(item => item.streamer_id === streamer.id)?.entered || 0)})) : [],
    rally:sim === 'acrally' ? {stages:details.rallyStages || [], host:details.rallyHost || '', carMode:details.rallyCarMode || '', minutes:details.rallyEstimatedMinutes || 0} : null,
    // The password itself never goes on Discord.
    password:Boolean(details.password) && row.access === 'safe' && !gridfest,
    // As on the site: the event's logo (OPEN / SAFE of its sim, or Gridfest) at TDZ only.
    logoUrl:tdz && site ? `${site}/images/event-access/${gridfest ? 'gridfest-stacked' : eventLogoName({sim, access:row.access, type:details.type})}.png` : ''};
}
const crewed = departure => (departure.crews || []).some(crew => crew.pilots?.length);
// An endurance as announced: today's starts with this community's crews and pilots (as in its thread).
async function raceSnapshot(env, community, id, timestamp) {
  const row = await env.DB.prepare('SELECT id,name,circuit,event_type,community_id,duration_hours,duration_minutes,details FROM events WHERE id=?').bind(id).first();
  if (!row) return null;
  const day = parisDay(timestamp), snapshot = await loadWeeklyDiscordSnapshot(env, timestamp, community, 'all', id);
  // Its starts with a crew, without the pilots still alone (they see the race on the site).
  const streamed = await streamedStarts(env, community, id);
  const departures = snapshot.futureDepartures.filter(item => parisDay(item.startsAt) === day && (crewed(item) || streamed.has(item.departureId))).map(item => ({...item, unassignedPilots:[]}));
  if (!departures.length) return null;
  const site = siteOf(env, community).url || '', sim = String(row.circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';
  return {id:row.id, name:row.name, circuit:row.circuit, eventType:row.event_type || '', official:row.community_id === 'official',
    logoUrl:site ? `${site}/images/event-access/endurance-${sim}.png` : '',
    durationMinutes:Number(row.duration_minutes) || Number(row.duration_hours) * 60 || 0, details:parse(row.details, {}) || {}, departures};
}
// The entries of this community's admins who stream an endurance start (« Je streame ce départ »).
const streamRows = async (env, community, eventId = null) => (await env.DB.prepare(`SELECT r.event_id,r.departure_id,r.stream_time,e.departures FROM registrations r
  JOIN events e ON e.id=r.event_id WHERE r.community_id=? AND r.stream_time<>'' AND COALESCE(r.status,'')<>'unavailable' ${eventId ? 'AND r.event_id=?' : ''}`)
  .bind(...[community.id, eventId].filter(Boolean)).all()).results || [];
async function streamedStarts(env, community, eventId = null) { return new Set((await streamRows(env, community, eventId)).map(row => row.departure_id)); }
// When an admin streams an endurance today: its earliest stream time.
async function raceStreamTime(env, community, eventId, timestamp) {
  const rows = await streamRows(env, community, eventId);
  const day = parisDay(timestamp);
  return rows.filter(row => today(parse(row.departures, []).find(start => start.id === row.departure_id), day)).map(row => row.stream_time).sort()[0] || '';
}
// The stream times the admins gave today's events (details.streamTime) and endurances, for the intro.
async function streamTimes(env, rows, community = null, timestamp = Date.now()) {
  const streams = [];
  for (const row of rows.filter(item => item.kind === 'race' && community)) {
    const time = await raceStreamTime(env, community, row.item, timestamp);
    if (time) streams.push({item:row.item, name:'', time});
  }
  for (const row of rows.filter(item => ['event','stream'].includes(item.kind))) {
    const event = await env.DB.prepare('SELECT name,details FROM events WHERE id=?').bind(row.item).first();
    // A stream announced with only the race's time starts then.
    const details = parse(event?.details, {}) || {}, time = details.streamTime || (row.kind === 'stream' ? details.raceTime : '');
    if (time) streams.push({item:row.item, name:event.name, time});
  }
  return streams;
}
// What a row of the announcement shows now (null: the race is gone from the site).
export async function announcePayload(env, community, row, timestamp, counts = null, stream = '') {
  const site = {...siteOf(env, community), streamUrl:stream}, absent = discordAbsentButton(env);
  if (row.kind === 'intro') return buildAnnounceIntro(counts || {events:0, races:0}, site);
  if (row.kind === 'event' || row.kind === 'stream') {
    const event = await eventSnapshot(env, community, row.item, timestamp);
    return !event ? null : event.stream ? buildAnnounceStream(event, site, timestamp) : buildAnnounceEvent(event, site, timestamp, absent);
  }
  const race = await raceSnapshot(env, community, row.item, timestamp);
  return race ? buildAnnounceRace(race, site, timestamp, await botCategoryEmojis(env, timestamp), absent) : null;
}

// One community: today's list made in the morning, its messages sent in order, then the counts kept up to date.
// Returns whether Discord was asked something.
export async function announceCommunity(env, community, settings, timestamp = Date.now()) {
  const channel = announceChannel(settings);
  if (!channel || !community.discordGuildId || settings.guild_id !== community.discordGuildId) return false;
  // Share the settings lock with recap sync/configuration; a nonce alone only deduplicates recent sends.
  const token = crypto.randomUUID(), now = Date.now();
  const lock = await env.DB.prepare('UPDATE community_recap_settings SET lock_token=?,lock_until=? WHERE community_id=? AND lock_until<?')
    .bind(token, now + 180000, community.id, now).run();
  if (!lock.meta.changes) return false;
  try {
    const current = await env.DB.prepare('SELECT * FROM community_recap_settings WHERE community_id=?').bind(community.id).first();
    if (!announceChannel(current) || current.guild_id !== community.discordGuildId) return false;
    return await publishAnnouncement(env, community, current, timestamp);
  } finally {
    await env.DB.prepare("UPDATE community_recap_settings SET lock_token='',lock_until=0 WHERE community_id=? AND lock_token=?").bind(community.id, token).run();
  }
}

const announcementRows = async (env, community, day) => (await env.DB.prepare('SELECT * FROM discord_announcements WHERE community_id=? AND day=? ORDER BY position').bind(community.id, day).all()).results || [];

// Retain the old location durably until its replacement has been saved and cleanup confirmed.
async function retainAnnouncement(env, community, day, row, timestamp) {
  if (!row.message_id || row.message_id === '-') return;
  await env.DB.prepare(`INSERT OR IGNORE INTO discord_announcements(community_id,day,item,kind,position,guild_id,channel_id,message_id,created_at)
    VALUES(?,?,?,'retired',-1,?,?,?,?)`).bind(community.id,day,`retired:${row.channel_id}:${row.message_id}`,community.discordGuildId,row.channel_id,row.message_id,timestamp).run();
}

async function removeOldAnnouncements(env, community, day, keep, budget) {
  const rows = await announcementRows(env, community, day), seen = new Set();
  let asked = false;
  for (const row of rows) {
    const key = `${row.channel_id}:${row.message_id}`;
    if (!row.message_id || row.message_id === '-' || seen.has(key) || keep?.has?.(key)) continue;
    if (budget.left <= 0) return {asked, done:false};
    seen.add(key);
    await discordRequest(env,'DELETE',`/channels/${row.channel_id}/messages/${row.message_id}`,null,budget)
      .catch(error => { if (error.status !== 404) throw error; });
    asked = true;
    await env.DB.prepare('UPDATE discord_announcements SET message_id=NULL WHERE community_id=? AND day=? AND channel_id=? AND message_id=?')
      .bind(community.id,day,row.channel_id,row.message_id).run();
  }
  return {asked, done:true};
}

// A message of the announcement: its poster (made when the message is sent, see publishSlot) and the same facts as text,
// the fallback; under it « S’inscrire » (and « Absent ») for each race, 5 rows at most.
const cut = (value, size) => value.length > size ? `${value.slice(0, size - 1)}…` : value;
function posterPayload(model, list, absent) {
  // No « Regarder le stream » button: the streamer posts his own message when he goes live (Nathan, 2026-11-07).
  const rows = [];
  const actionable = list.filter(item => item.kind !== 'stream' && /^https:\/\//.test(item.url));
  const name = item => String(item.data.name || '').replace(/[\u0000-\u001f]/g, ' ').trim();
  const join = item => {
    const gridfest = item.data.streamers?.length > 0, more = actionable.length > 1 ? ` · ${name(item)}` : '';
    return [{type:2,style:5,label:cut(`${gridfest ? 'Piloter pour un streamer' : 'S’inscrire'}${more}`,80),emoji:{name:gridfest ? '🎙️' : '✅'},url:item.url},
      // The race's name once per row, on « S’inscrire »: « Absent » next to it is for the same race (2026-11-13).
      ...(absent ? [{...absent(item.row.item),label:'Absent'}] : [])];
  };
  if (actionable.length === 1) rows.push({type:1,components:join(actionable[0])});
  else {
    if (actionable.length + rows.length <= 5) rows.push(...actionable.map(item => ({type:1,components:join(item)})));
    else if (actionable.length) rows.push({type:1,components:[{type:2,style:5,label:'S’inscrire sur le site',emoji:{name:'✅'},url:actionable[0].url.replace(/\/(lmu|iracing)\/#.*$/, '/events/')}]});
  }
  const embed = {description:posterText(model),color:model.gridfest ? 0xff7b00 : model.live ? 0x9146ff : 0xe8792b};
  if (model.live && /^https:\/\//.test(model.banner || '')) embed.image = {url:model.banner};
  return {content:'',embeds:[embed],components:rows,allowed_mentions:{parse:[]},poster:posterHtml(model)};
}

// The day's message (row 'intro'; 'races' was the second message of older days): recovered after a lost answer,
// edited in place, sent again silently when gone, or removed when it has nothing left to say (payload null).
async function publishSlot(env, community, day, channel, row, input, ping, budget, timestamp) {
  let asked = false;
  const {poster = '', ...payload} = input || {};
  const save = (sql, ...values) => env.DB.prepare(`UPDATE discord_announcements SET ${sql} WHERE community_id=? AND day=? AND item=?`).bind(...values, community.id, day, row.item).run();
  // A POST may have succeeded even when its response or the subsequent DB write failed.
  // Recover its ID before any retry. Failure to read history fails closed (no second POST).
  if (row.pending_nonce) {
    const history = await discordRequest(env,'GET',`/channels/${row.pending_channel_id}/messages?limit=100`,null,budget);
    asked = true;
    if (!Array.isArray(history)) throw new Error('Discord n’a pas confirmé l’historique des annonces.');
    const recovered = history.find(message => String(message.nonce || '') === row.pending_nonce && message.author?.id === env.DISCORD_CLIENT_ID);
    if (recovered) {
      if (row.message_id !== recovered.id || row.channel_id !== row.pending_channel_id) await retainAnnouncement(env,community,day,row,timestamp);
      await save("message_id=?,channel_id=?,content_hash=?,pending_nonce='',pending_hash='',pending_channel_id=''",recovered.id,row.pending_channel_id,row.pending_hash);
      row = {...row,message_id:recovered.id,channel_id:row.pending_channel_id,content_hash:row.pending_hash,pending_nonce:'',pending_hash:'',pending_channel_id:''};
    }
  }
  // A poster already sent stays until midnight even when nothing is left on it: a cancelled race is crossed out instead
  // (crossOutCancelled, Nathan 2026-11-07).
  if (!input && row.message_id && row.message_id !== '-' && !row.pending_nonce && String(row.content_hash || '').startsWith(`${PREFIX}poster:`)) {
    await save('checked_at=?',timestamp);
    return {asked, id:row.message_id};
  }
  if (!input) {
    if (row.message_id && row.message_id !== '-' && !row.pending_nonce) {
      if (budget.left <= 0) return {asked, id:row.message_id};
      await discordRequest(env,'DELETE',`/channels/${row.channel_id}/messages/${row.message_id}`,null,budget).catch(error => { if (error.status !== 404) throw error; });
      asked = true;
      // The races of that message point to it too: no second DELETE at cleanup.
      await env.DB.prepare('UPDATE discord_announcements SET message_id=NULL WHERE community_id=? AND day=? AND channel_id=? AND message_id=?').bind(community.id,day,row.channel_id,row.message_id).run();
    }
    await save("message_id=NULL,content_hash=?,checked_at=?,ping_attempted=1,pending_nonce='',pending_hash='',pending_channel_id=''",PREFIX+'empty',timestamp);
    return {asked, id:null};
  }
  let hash = await contentHash(payload);
  const previousId = row.message_id, previousChannel = row.channel_id;
  // A poster is made once: later changes (a late entrant) stay on the site, the message is only checked.
  const posted = String(row.content_hash || '').startsWith(`${PREFIX}poster:`);
  // A channel move (or an older layout) needs a silent replacement.
  const replace = previousChannel !== channel || !String(row.content_hash || '').startsWith(PREFIX);
  let id = previousId;
  if (previousId && !replace && !row.pending_nonce) {
    try {
      const changed = hash !== row.content_hash && !posted;
      if (posted) hash = row.content_hash;
      const confirmed = await discordRequest(env,changed ? 'PATCH' : 'GET',`/channels/${channel}/messages/${previousId}`,
        changed ? {...payload,allowed_mentions:{parse:[]}} : null,budget);
      if (confirmed?.id !== previousId) throw new Error('Discord n’a pas confirmé le message de l’annonce.');
      asked = true;
    } catch (error) {
      if (error.status !== 404 || error.code !== 10008) throw error;
      id = null;
    }
  } else id = null;
  if (!id) {
    if (previousId || row.pending_nonce) ping = false;
    // The picture first (a few seconds in Cloudflare's browser); without it, the text.
    const picture = poster ? await renderPoster(env, poster, {community, origin:siteOf(env, community).url}) : null;
    if (picture) hash = `${PREFIX}poster:${hash.slice(PREFIX.length)}`;
    // Reserve the only possible mention BEFORE the network call. An ambiguous retry is silent.
    const nonce = row.pending_nonce || crypto.randomUUID().replaceAll('-','').slice(0,24);
    if (previousId) await retainAnnouncement(env,community,day,{message_id:previousId,channel_id:previousChannel},timestamp);
    const reserved = await env.DB.prepare("UPDATE discord_announcements SET ping_attempted=1,pending_nonce=?,pending_hash=?,pending_channel_id=? WHERE community_id=? AND day=? AND item=? AND pending_nonce=? AND ping_attempted=? AND COALESCE(message_id,'')=?")
      .bind(nonce,hash,channel,community.id,day,row.item,row.pending_nonce,row.ping_attempted,previousId || '').run();
    if (!reserved.meta.changes) return {asked, id:null, blocked:true};
    // 'everyone': the stream's @everyone; 'alert': a plain message notification, no mention; otherwise silent.
    const body = ping === 'everyone' ? {...payload,content:'@everyone',allowed_mentions:{parse:['everyone']}}
      : ping === 'alert' ? {...payload,allowed_mentions:{parse:[]}}
      : {...payload,allowed_mentions:{parse:[]},flags:(payload.flags || 0) | 4096};
    let request = {...body,nonce,enforce_nonce:true};
    if (picture) {
      // The poster alone: the text would repeat it.
      request = new FormData();
      request.append('payload_json', JSON.stringify({...body,embeds:[],attachments:[{id:0,filename:'annonce.png'}],nonce,enforce_nonce:true}));
      request.append('files[0]', new Blob([picture], {type:'image/png'}), 'annonce.png');
    }
    const message = await discordRequest(env,'POST',`/channels/${channel}/messages`,request,budget);
    if (!message?.id) throw new Error('Discord n’a pas confirmé la publication de l’annonce.');
    id = message.id;asked = true;
  }
  await save("message_id=?,channel_id=?,content_hash=?,checked_at=?,ping_attempted=1,pending_nonce='',pending_hash='',pending_channel_id=''",id,channel,hash,timestamp);
  return {asked, id};
}

async function publishAnnouncement(env, community, settings, timestamp) {
  const channel = announceChannel(settings), stream = announceStream(settings);
  const day = parisDay(timestamp), minutes = parisMinutes(timestamp), budget = {left:REQUESTS};
  if (minutes < FROM) return false;
  let rows = await announcementRows(env, community, day);
  // A day already announced by an older version of the site keeps its message until midnight: a deploy during the day
  // never deletes and reposts the morning's announcement (Nathan, 2026-11-01). The new layout starts the next morning.
  const older = rows.find(row => row.item === 'intro');
  if (older?.content_hash && !String(older.content_hash).startsWith(PREFIX) && !older.pending_nonce) return false;
  if (!rows.some(row => row.item === 'intro')) {
    // Existing days (including legacy 'none') have already had their morning opportunity.
    await env.DB.prepare(`INSERT OR IGNORE INTO discord_announcements(community_id,day,item,kind,position,guild_id,channel_id,created_at,ping_attempted)
      VALUES(?,?,?,'intro',0,?,?,?,?)`).bind(community.id,day,'intro',community.discordGuildId,channel,timestamp,rows.length ? 1 : 0).run();
  }
  rows = await announcementRows(env, community, day);
  const intro = rows.find(row => row.item === 'intro'), slots = [intro];
  const ids = new Set(slots.map(row => row.message_id).filter(Boolean));
  const legacy = rows.some(row => !['intro','part'].includes(row.kind) && row.message_id && row.message_id !== '-' && !ids.has(row.message_id));
  const due = slots.some(row => row.pending_nonce || !String(row.content_hash || '').startsWith(PREFIX) || (row.message_id && row.channel_id !== channel))
    || legacy || timestamp - Math.min(...slots.map(row => Number(row.checked_at || 0))) >= REFRESH_EVERY;
  if (!due) return false;
  // Rebuild the eligible list: a late entrant can add a race without another ping.
  const eligible = await announceItems(env,community,timestamp), items = [], activeRows = [];
  const layout = parseLayout(settings.layout) || {}, site = {...siteOf(env,community),streamUrl:stream,streamName:layout.streamName || ''};
  for (const row of eligible) {
    const data = row.kind === 'race' ? await raceSnapshot(env,community,row.item,timestamp) : await eventSnapshot(env,community,row.item,timestamp);
    if (!data) continue;
    activeRows.push(row);
    items.push({row,kind:data.stream ? 'stream' : row.kind,data,url:row.kind === 'race' ? raceUrl(site.url,{eventId:row.item,circuit:data.circuit}) : site.url ? `${site.url}/lmu/#event=${encodeURIComponent(row.item)}` : ''});
  }
  // An event of the calendar for the same race as an endurance of today (same name, start within an hour): told once,
  // by the endurance, as on the calendar (Nathan, 2026-11-13: two « Production Endurance Challenge » on one poster).
  const twins = new Map(), twinRows = [];
  for (const item of items.filter(item => item.kind === 'event')) {
    const race = items.find(other => other.kind === 'race' && sameName(other.data.name, item.data.name)
      && (other.data.departures || []).some(start => Math.abs(Number(start.startsAt) - item.data.startsAt) < HOUR));
    if (race) twins.set(item.row.item, race.row.item);
  }
  for (let index = items.length - 1; index >= 0; index--) if (twins.has(items[index].row.item)) {
    items.splice(index, 1);
    twinRows.push(...activeRows.splice(index, 1));
  }
  for (const [position,row] of activeRows.entries()) {
    await env.DB.prepare(`INSERT OR IGNORE INTO discord_announcements(community_id,day,item,kind,position,guild_id,channel_id,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(community.id,day,row.item,row.kind,position+1,community.discordGuildId,channel,timestamp).run();
    await env.DB.prepare('UPDATE discord_announcements SET name=? WHERE community_id=? AND day=? AND item=?')
      .bind(String(items[position]?.data?.name || ''),community.id,day,row.item).run();
  }
  let streams = await streamTimes(env,[...activeRows,...twinRows],community,timestamp);
  // The stream time given on a twin event is its endurance's.
  for (const entry of streams.filter(entry => twins.has(entry.item))) if (!streams.some(other => other.item === twins.get(entry.item))) streams.push({item:twins.get(entry.item), name:'', time:entry.time});
  streams = streams.filter(entry => !twins.has(entry.item));
  // A stream announced during an endurance start the community streams is that endurance's stream: told once.
  const streamedStarts = items.filter(item => item.kind === 'race' && streams.some(stream => stream.item === item.row.item)).flatMap(item => item.data.departures || []);
  const merged = new Set(items.filter(item => item.kind === 'stream' && streamDuringEndurance(item.data.startsAt, streamedStarts)).map(item => item.row.item));
  // A stream of a race shown today (Nathan, 2026-11-11): the race's stream, at the stream's time, told once.
  for (const item of items) {
    // His endurance (his crew in it), or an event of today for the same race.
    const race = stream && item.kind === 'stream' && !merged.has(item.row.item) && (items.find(other => other.kind === 'race' && other.row.item === item.data.stream?.crew?.eventId)
      || items.find(other => other.kind === 'event' && !streams.some(entry => entry.item === other.row.item)
        && streamIsRace({name:item.data.name, startsAt:item.data.startsAt, time:item.data.time, ...item.data.stream}, other.data)));
    if (!race) continue;
    merged.add(item.row.item);
    const time = streams.find(entry => entry.item === item.row.item)?.time;
    if (time && !streams.some(entry => entry.item === race.row.item)) streams.push({item:race.row.item, name:'', time});
  }
  if (merged.size) { items.splice(0, items.length, ...items.filter(item => !merged.has(item.row.item))); streams = streams.filter(stream => !merged.has(stream.item)); }
  const streamed = new Set(streams.map(item => item.item));
  site.streams = streams;
  // The stream's message: an « Annoncer un stream », or the community's stream link with a stream time on a race today.
  const live = items.filter(item => item.kind === 'stream' || (stream && streamed.has(item.row.item)));
  const rest = items.filter(item => !live.includes(item));
  const absent = discordAbsentButton(env), list = [...live, ...rest];
  const payload = !list.length ? null : posterPayload(live.length ? posterModel(live,site,{live:true,timestamp,rest}) : posterModel(rest,site,{timestamp}),list,absent);
  // One notification, on the first morning evaluation (7h30–9h): @everyone with a stream, otherwise a plain alert.
  const ping = intro.ping_attempted === 0 && minutes < UNTIL ? (live.length ? 'everyone' : 'alert') : false;
  const first = await publishSlot(env,community,day,channel,intro,payload,ping,budget,timestamp);
  if (first.blocked) return first.asked;
  // Persist before cleanup: retired references survive an interrupted cleanup.
  const keep = new Set([first.id].filter(Boolean).map(id => `${channel}:${id}`));
  const cleanup = await removeOldAnnouncements(env,community,day,keep,budget);
  for (const item of items) {
    await env.DB.prepare('UPDATE discord_announcements SET message_id=?,channel_id=?,checked_at=? WHERE community_id=? AND day=? AND item=? AND (message_id IS NULL OR message_id=?)')
      .bind(first.id,channel,timestamp,community.id,day,item.row.item,first.id || '').run();
  }
  const crossed = await crossOutCancelled(env,community,day,channel,[first.id],new Set(items.map(item => item.row.item)),budget);
  const asked = first.asked;
  return asked || cleanup.asked || crossed;
}

// A poster is never drawn again: a race of it cancelled since (deleted, or no start today any more) is crossed out in
// the message's text, silently (Nathan, 2026-11-07). A race only left without crew or entries is not « cancelled ».
async function crossOutCancelled(env, community, day, channel, ids, current, budget) {
  let asked = false;
  for (const id of ids.filter(Boolean)) {
    const rows = await env.DB.prepare(`SELECT item,name,cancelled FROM discord_announcements WHERE community_id=? AND day=? AND message_id=? AND channel_id=?
      AND kind IN ('event','race','stream') ORDER BY position`).bind(community.id,day,id,channel).all().then(result => result.results || []);
    const slot = await env.DB.prepare("SELECT content_hash FROM discord_announcements WHERE community_id=? AND day=? AND message_id=? AND item IN ('intro','races')").bind(community.id,day,id).first();
    if (!String(slot?.content_hash || '').startsWith(`${PREFIX}poster:`)) continue;
    let changed = false;
    for (const row of rows.filter(row => !row.cancelled && !current.has(row.item))) {
      const event = await env.DB.prepare('SELECT departures FROM events WHERE id=?').bind(row.item).first();
      if (event && parse(event.departures, []).some(start => today(start, day))) continue;
      await env.DB.prepare('UPDATE discord_announcements SET cancelled=1 WHERE community_id=? AND day=? AND item=?').bind(community.id,day,row.item).run();
      row.cancelled = 1;changed = true;
    }
    if (!changed || budget.left <= 0) continue;
    const content = rows.filter(row => row.cancelled).map(row => `❌ ~~${String(row.name || 'Course').replace(/[\\*_~`|[\]<>@#]/g, match => `\\${match}`)}~~ · annulée`).join('\n');
    await discordRequest(env,'PATCH',`/channels/${channel}/messages/${id}`,{content,allowed_mentions:{parse:[]}},budget);
    asked = true;
  }
  return asked;
}

// Every 2 minutes: the first community with something to send or to refresh. Old days are forgotten after a week.
export async function syncAnnouncements(env, timestamp = Date.now()) {
  if (!env?.DB || !env.DISCORD_BOT_TOKEN) return false;
  const settings = (await env.DB.prepare(`SELECT * FROM community_recap_settings WHERE enabled=1 AND layout LIKE '%"announce":"%'`).all()).results || [];
  for (const row of settings.filter(announceChannel)) {
    const community = await communityById(env, row.community_id);
    if (!community) continue;
    try { if (await announceCommunity(env, community, row, timestamp)) return true; }
    catch (error) { console.error('Discord announcement failed', community.slug, error instanceof Error ? error.message : 'unknown'); }
  }
  if (parisMinutes(timestamp) === 0) await env.DB.prepare('DELETE FROM discord_announcements WHERE created_at<?').bind(timestamp - 7 * 1440 * MINUTE).run();
  return false;
}

// « Envoyer un aperçu » (admin): a stream day with example data, as a poster when Cloudflare's browser answers.
export async function sendAnnouncementPreview(env, community, channel, site, timestamp = Date.now()) {
  const round = {circuit:'Velo Città', category:'GT4', car:'Ginetta G55', practice:10, qualifying:10, durationMinutes:20};
  const event = {id:'demo', name:'APERÇU · SAFE’S RACE', sim:'ams2', type:'SAFE', access:'safe', tdz:true, startsAt:timestamp, entered:13, capacity:20,
    rounds:[round, {...round, durationMinutes:40}], logoUrl:site.url ? `${site.url}/images/event-access/safe-ams2.png` : ''};
  const list = [{row:{item:'demo', kind:'event'}, kind:'event', data:event, url:''}];
  const {poster, ...payload} = posterPayload(posterModel(list, {...site, streams:[{item:'demo', time:'20:45'}]}, {live:true, timestamp}), list, null);
  const picture = await renderPoster(env, poster, {community, origin:site.url});
  const body = {...payload, content:'Aperçu · données d’exemple', allowed_mentions:{parse:[]}};
  let request = body;
  if (picture) {
    request = new FormData();
    request.append('payload_json', JSON.stringify({...body, embeds:[], attachments:[{id:0, filename:'annonce.png'}]}));
    request.append('files[0]', new Blob([picture], {type:'image/png'}), 'annonce.png');
  }
  const sent = await discordRequest(env, 'POST', `/channels/${channel}/messages`, request);
  return {id:sent.id, poster:Boolean(picture)};
}
