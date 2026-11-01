// At 7h30 (Paris), two messages (Nathan, 2026-11-01): the stream of the day first, with the races it streams, the only
// one that pings @everyone; then the day's other endurances and events, without a ping. A day without a stream has only
// the second one. Counts are updated in place; older layouts are replaced without a ping.
import {communityById} from './community.mjs';
import {iracingSoloSql} from './iracing-visibility.mjs';
import {loadWeeklyDiscordSnapshot, siteOf} from './discord-weekly.mjs';
import {buildAnnounceIntro, buildAnnounceEvent, buildAnnounceRace, buildAnnounceStream, parisDay, raceUrl} from './discord-weekly-format.mjs';
import {posterModel, posterHtml, posterText, renderPoster} from './discord-poster.mjs';
import {discordRequest, botCategoryEmojis} from './recap-discord.mjs';
import {discordAbsentButton} from './discord-interactions.mjs';
import {parseLayout} from './discord-layout.mjs';
import {simForEvent, tdzOnly, normalizeTdzEventType} from '../shared/catalog.mjs';
import {grindfestEnabled, isGrindfest, streamersOf} from '../shared/grindfest.mjs';
import {isDevelopment} from './dev-environment.mjs';
import {isStream, streamDetails} from '../shared/stream.mjs';
import {streamCrew} from './stream-crew.mjs';

const MINUTE = 60000;
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
const PREFIX = 'split-v1:';
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
  const solo = (await env.DB.prepare(`SELECT id,sim,departures,schedule_pending FROM events WHERE ${SOLO_SQL(env, community)}`).bind(community.id).all()).results || [];
  const registrations = (await env.DB.prepare(`SELECT event_id,departure_id FROM registrations
    WHERE community_id=? AND COALESCE(status,'')<>'unavailable' GROUP BY event_id,departure_id`).bind(community.id).all()).results || [];
  for (const row of solo) {
    const starts = parse(row.departures, []).filter(start => today(start, day)
      && (isStream(row) || registrations.some(entry => entry.event_id === row.id && entry.departure_id === start.id)));
    // A stream (« Annoncer un stream ») has its own card, without « Présent » nor « Absent ».
    if (starts.length) items.push({item:row.id, kind:isStream(row) ? 'stream' : 'event', startsAt:Math.min(...starts.map(start => Number(start.startsAt)))});
  }
  // The endurances as in the week's message (official LMU ones included, iRacing ones as the community shows them).
  const snapshot = await loadWeeklyDiscordSnapshot(env, parisDayStart(timestamp), community, 'all');
  // Only the starts with a crew: the announcement puts forward who is sure to race that day (Nathan, 2026-11-01).
  for (const departure of snapshot.futureDepartures.filter(item => parisDay(item.startsAt) === day && crewed(item))) {
    const known = items.find(item => item.item === departure.eventId);
    if (!known) items.push({item:departure.eventId, kind:'race', startsAt:departure.startsAt});
  }
  return items.sort((a, b) => a.startsAt - b.startsAt || a.item.localeCompare(b.item));
}

// An event of the calendar as announced: its rounds, its places and this community's entries for today's start.
async function eventSnapshot(env, community, id, timestamp) {
  const row = await env.DB.prepare(`SELECT id,name,sim,circuit,rounds,capacity,access,details,departures,schedule_pending,created_by FROM events WHERE id=? AND ${SOLO_SQL(env, community)}`)
    .bind(id, community.id).first();
  if (!row) return null;
  const day = parisDay(timestamp);
  const entries = isStream(row) ? [] : (await env.DB.prepare(`SELECT departure_id,streamer_id,COUNT(DISTINCT COALESCE(participant_id,id)) AS entered FROM registrations
    WHERE event_id=? AND community_id=? AND COALESCE(status,'')<>'unavailable' GROUP BY departure_id,streamer_id`).bind(row.id, community.id).all()).results || [];
  const start = parse(row.departures, []).find(item => today(item, day)
    && (isStream(row) || entries.some(entry => entry.departure_id === item.id)));
  if (!start) return null;
  const details = parse(row.details, {}) || {}, sim = simForEvent(row), tdz = tdzOnly(community, isDevelopment(env));
  if (isStream(row)) return {id:row.id, name:row.name, startsAt:Number(start.startsAt), stream:{...streamDetails({details}), crew:await streamCrew(env, community.id, row)}};
  const startEntries = entries.filter(entry => entry.departure_id === start.id);
  const entered = startEntries.reduce((total, item) => total + Number(item.entered || 0), 0);
  if (!entered) return null;
  const gridfest = isGrindfest(row), site = siteOf(env, community).url || '';
  return {id:row.id, name:row.name, sim, type:normalizeTdzEventType(details.type) || '', access:tdz ? row.access || 'open' : '', tdz, note:details.note || '',
    startsAt:Number(start.startsAt), timePending:Boolean(row.schedule_pending) || start.tbd === true,
    rounds:parse(row.rounds, []), capacity:row.capacity == null ? null : Number(row.capacity), entered,
    streamers:gridfest ? streamersOf(row).map(streamer => ({name:streamer.name, twitchUrl:streamer.twitchUrl, logoUrl:streamer.logoUrl || '', capacity:streamer.capacity, entered:Number(startEntries.find(item => item.streamer_id === streamer.id)?.entered || 0)})) : [],
    rally:sim === 'acrally' ? {stages:details.rallyStages || [], host:details.rallyHost || '', carMode:details.rallyCarMode || '', minutes:details.rallyEstimatedMinutes || 0} : null,
    // The password itself never goes on Discord.
    password:Boolean(details.password) && row.access === 'safe' && !gridfest,
    // As on the site: the event's logo (OPEN / SAFE of its sim, or Gridfest) at TDZ only.
    logoUrl:tdz && site ? `${site}/images/event-access/${gridfest ? 'gridfest-stacked' : `${row.access === 'safe' ? 'safe' : 'open'}-${sim}`}.png` : ''};
}
const crewed = departure => (departure.crews || []).some(crew => crew.pilots?.length);
// An endurance as announced: today's starts with this community's crews and pilots (as in its thread).
async function raceSnapshot(env, community, id, timestamp) {
  const row = await env.DB.prepare('SELECT id,name,circuit,event_type,community_id,duration_hours,duration_minutes,details FROM events WHERE id=?').bind(id).first();
  if (!row) return null;
  const day = parisDay(timestamp), snapshot = await loadWeeklyDiscordSnapshot(env, timestamp, community, 'all', id);
  // Its starts with a crew, without the pilots still alone (they see the race on the site).
  const departures = snapshot.futureDepartures.filter(item => parisDay(item.startsAt) === day && crewed(item)).map(item => ({...item, unassignedPilots:[]}));
  if (!departures.length) return null;
  return {id:row.id, name:row.name, circuit:row.circuit, eventType:row.event_type || '', official:row.community_id === 'official',
    durationMinutes:Number(row.duration_minutes) || Number(row.duration_hours) * 60 || 0, details:parse(row.details, {}) || {}, departures};
}
// The stream times the admins gave today's events (details.streamTime), for the intro.
async function streamTimes(env, rows) {
  const streams = [];
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
// the fallback; under it « Regarder le stream », then « S’inscrire » (and « Absent ») for each race, 5 rows at most.
const cut = (value, size) => value.length > size ? `${value.slice(0, size - 1)}…` : value;
function posterPayload(model, list, absent) {
  const rows = [], stream = model.live && /^https:\/\//.test(model.streamUrl) ? {type:2,style:5,label:'Regarder le stream',emoji:{name:'📺'},url:model.streamUrl} : null;
  const actionable = list.filter(item => item.kind !== 'stream' && /^https:\/\//.test(item.url));
  const name = item => String(item.data.name || '').replace(/[\u0000-\u001f]/g, ' ').trim();
  const join = item => {
    const gridfest = item.data.streamers?.length > 0, more = actionable.length > 1 ? ` · ${name(item)}` : '';
    return [{type:2,style:5,label:cut(`${gridfest ? 'Piloter pour un streamer' : 'S’inscrire'}${more}`,80),emoji:{name:gridfest ? '🎙️' : '✅'},url:item.url},
      ...(absent ? [{...absent(item.row.item),label:cut(`Absent${more}`,80)}] : [])];
  };
  if (actionable.length === 1) rows.push({type:1,components:[...(stream ? [stream] : []),...join(actionable[0])]});
  else {
    if (stream) rows.push({type:1,components:[stream]});
    if (actionable.length + rows.length <= 5) rows.push(...actionable.map(item => ({type:1,components:join(item)})));
    else if (actionable.length) rows.push({type:1,components:[{type:2,style:5,label:'S’inscrire sur le site',emoji:{name:'✅'},url:actionable[0].url.replace(/\/(lmu|iracing)\/#.*$/, '/events/')}]});
  }
  const embed = {description:posterText(model),color:model.gridfest ? 0xff7b00 : model.live ? 0x9146ff : 0xe8792b};
  if (model.live && /^https:\/\//.test(model.banner || '')) embed.image = {url:model.banner};
  return {content:'',embeds:[embed],components:rows,allowed_mentions:{parse:[]},poster:posterHtml(model)};
}

// One of the day's two messages (row: 'intro' for the stream, 'races' for the rest): recovered after a lost answer,
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
  if (!rows.some(row => row.item === 'intro')) {
    // Existing days (including legacy 'none') have already had their morning opportunity.
    await env.DB.prepare(`INSERT OR IGNORE INTO discord_announcements(community_id,day,item,kind,position,guild_id,channel_id,created_at,ping_attempted)
      VALUES(?,?,?,'intro',0,?,?,?,?)`).bind(community.id,day,'intro',community.discordGuildId,channel,timestamp,rows.length ? 1 : 0).run();
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO discord_announcements(community_id,day,item,kind,position,guild_id,channel_id,created_at)
    VALUES(?,?,'races','part',0,?,?,?)`).bind(community.id,day,community.discordGuildId,channel,timestamp).run();
  rows = await announcementRows(env, community, day);
  const intro = rows.find(row => row.item === 'intro'), races = rows.find(row => row.item === 'races'), slots = [intro, races];
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
  for (const [position,row] of activeRows.entries()) await env.DB.prepare(`INSERT OR IGNORE INTO discord_announcements(community_id,day,item,kind,position,guild_id,channel_id,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(community.id,day,row.item,row.kind,position+1,community.discordGuildId,channel,timestamp).run();
  const streams = await streamTimes(env,activeRows), streamed = new Set(streams.map(item => item.item));
  site.streams = streams;
  // The stream's message: an « Annoncer un stream », or the community's stream link with a stream time on a race today.
  const live = items.filter(item => item.kind === 'stream' || (stream && streamed.has(item.row.item)));
  const rest = items.filter(item => !live.includes(item));
  const absent = discordAbsentButton(env);
  const livePayload = live.length ? posterPayload(posterModel(live,site,{live:true,timestamp}),live,absent) : null;
  const restPayload = rest.length ? posterPayload(posterModel(rest,site,{timestamp}),rest,absent) : null;
  // Only the stream's message pings, once, on the first morning evaluation (7h30–9h).
  const ping = intro.ping_attempted === 0 && minutes < UNTIL && Boolean(livePayload);
  if (intro.ping_attempted === 0 && !livePayload) await env.DB.prepare("UPDATE discord_announcements SET ping_attempted=1 WHERE community_id=? AND day=? AND item='intro'").bind(community.id,day).run();
  let asked = false;
  // A day without a stream: the races alone, with a plain message alert (no @everyone), once that morning.
  const alert = !livePayload && intro.ping_attempted === 0 && minutes < UNTIL ? 'alert' : false;
  const first = await publishSlot(env,community,day,channel,intro,livePayload,ping ? 'everyone' : false,budget,timestamp);asked ||= first.asked;
  if (first.blocked) return asked;
  const second = await publishSlot(env,community,day,channel,races,restPayload,alert,budget,timestamp);asked ||= second.asked;
  if (second.blocked) return asked;
  // Persist before cleanup: retired references survive an interrupted cleanup.
  const keep = new Set([first.id,second.id].filter(Boolean).map(id => `${channel}:${id}`));
  const cleanup = await removeOldAnnouncements(env,community,day,keep,budget);
  for (const item of items) {
    const id = live.includes(item) ? first.id : second.id;
    await env.DB.prepare('UPDATE discord_announcements SET message_id=?,channel_id=?,checked_at=? WHERE community_id=? AND day=? AND item=? AND (message_id IS NULL OR message_id=? OR message_id=?)')
      .bind(id,channel,timestamp,community.id,day,item.row.item,first.id || '',second.id || '').run();
  }
  return asked || cleanup.asked;
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
