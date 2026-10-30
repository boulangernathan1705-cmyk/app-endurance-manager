// At 7h30 (Paris), one message combines the community intro and today's events,
// endurances and streams. Existing builders retain the type/sim-specific details.
// Counts are updated in place; legacy split messages are consolidated without a ping.
import {communityById} from './community.mjs';
import {iracingSoloSql} from './iracing-visibility.mjs';
import {loadWeeklyDiscordSnapshot, siteOf} from './discord-weekly.mjs';
import {buildCompleteAnnouncement, buildAnnounceIntro, buildAnnounceEvent, buildAnnounceRace, buildAnnounceStream, parisDay} from './discord-weekly-format.mjs';
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
const formatPrefix = settings => parseLayout(settings.layout)?.announceFormat === 'v2' ? 'components-v2:' : 'single-embed-v1:';
const contentHash = async (payload, prefix) => prefix + await digest({...payload, embeds:(payload.embeds || []).map(({footer, ...embed}) => embed)});

// The channel chosen for the announcement, or '' (layout.announce).
export const announceChannel = settings => settings?.enabled === 0 ? '' : String(parseLayout(settings?.layout)?.announce || '');
// The community's stream, linked in the intro of the announcement, or '' (layout.stream).
export const announceStream = settings => String(parseLayout(settings?.layout)?.stream || '');

const SOLO_SQL = (env, community) => `(community_id=? OR community_id='official') AND format='solo' AND ${iracingSoloSql(env, community)}
  ${grindfestEnabled(community, isDevelopment(env)) ? '' : "AND COALESCE(json_extract(details,'$.type'),'') NOT IN ('Gridfest','Grindfest')"}`;
// A start of today still to come (or today with its time to confirm).
const today = (start, day, timestamp, pending) => Number.isFinite(Number(start?.startsAt)) && parisDay(Number(start.startsAt)) === day
  && (pending || start.tbd === true || Number(start.startsAt) > timestamp);

// The day's races of a community, in the order of their first start today: [{item, kind:'event'|'race', startsAt}].
export async function announceItems(env, community, timestamp) {
  const day = parisDay(timestamp), items = [];
  const solo = (await env.DB.prepare(`SELECT id,sim,departures,schedule_pending FROM events WHERE ${SOLO_SQL(env, community)}`).bind(community.id).all()).results || [];
  const registrations = (await env.DB.prepare(`SELECT event_id,departure_id FROM registrations
    WHERE community_id=? AND COALESCE(status,'')<>'unavailable' GROUP BY event_id,departure_id`).bind(community.id).all()).results || [];
  for (const row of solo) {
    const starts = parse(row.departures, []).filter(start => today(start, day, timestamp, Boolean(row.schedule_pending))
      && (isStream(row) || registrations.some(entry => entry.event_id === row.id && entry.departure_id === start.id)));
    // A stream (« Annoncer un stream ») has its own card, without « Présent » nor « Absent ».
    if (starts.length) items.push({item:row.id, kind:isStream(row) ? 'stream' : 'event', startsAt:Math.min(...starts.map(start => Number(start.startsAt)))});
  }
  // The endurances as in the week's message (official LMU ones included, iRacing ones as the community shows them).
  const snapshot = await loadWeeklyDiscordSnapshot(env, timestamp, community, 'all');
  for (const departure of snapshot.futureDepartures.filter(item => parisDay(item.startsAt) === day && item.pilotCount > 0)) {
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
  const start = parse(row.departures, []).find(item => today(item, day, timestamp, Boolean(row.schedule_pending))
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
    streamers:gridfest ? streamersOf(row).map(streamer => ({name:streamer.name, twitchUrl:streamer.twitchUrl, capacity:streamer.capacity, entered:Number(startEntries.find(item => item.streamer_id === streamer.id)?.entered || 0)})) : [],
    rally:sim === 'acrally' ? {stages:details.rallyStages || [], host:details.rallyHost || '', carMode:details.rallyCarMode || '', minutes:details.rallyEstimatedMinutes || 0} : null,
    // The password itself never goes on Discord.
    password:Boolean(details.password) && row.access === 'safe' && !gridfest,
    // As on the site: the event's logo (OPEN / SAFE of its sim, or Gridfest) at TDZ only.
    logoUrl:tdz && site ? `${site}/images/event-access/${gridfest ? 'gridfest-stacked' : `${row.access === 'safe' ? 'safe' : 'open'}-${sim}`}.png` : ''};
}
// An endurance as announced: today's starts with this community's crews and pilots (as in its thread).
async function raceSnapshot(env, community, id, timestamp) {
  const row = await env.DB.prepare('SELECT id,name,circuit,event_type,community_id,duration_hours,duration_minutes,details FROM events WHERE id=?').bind(id).first();
  if (!row) return null;
  const day = parisDay(timestamp), snapshot = await loadWeeklyDiscordSnapshot(env, timestamp, community, 'all', id);
  const departures = snapshot.futureDepartures.filter(item => parisDay(item.startsAt) === day && item.pilotCount > 0 && (item.timePending || item.startsAt > timestamp));
  if (!departures.length) return null;
  return {id:row.id, name:row.name, circuit:row.circuit, eventType:row.event_type || '', official:row.community_id === 'official',
    durationMinutes:Number(row.duration_minutes) || Number(row.duration_hours) * 60 || 0, details:parse(row.details, {}) || {}, departures};
}
// The stream times the admins gave today's events (details.streamTime), for the intro.
async function streamTimes(env, rows) {
  const streams = [];
  for (const row of rows.filter(item => ['event','stream'].includes(item.kind))) {
    const event = await env.DB.prepare('SELECT name,details FROM events WHERE id=?').bind(row.item).first();
    const time = parse(event?.details, {})?.streamTime;
    if (time) streams.push({name:event.name, time});
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
    if (!row.message_id || row.message_id === '-' || seen.has(key) || key === keep) continue;
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

async function publishAnnouncement(env, community, settings, timestamp) {
  const channel = announceChannel(settings), stream = announceStream(settings);
  const day = parisDay(timestamp), minutes = parisMinutes(timestamp), budget = {left:REQUESTS};
  if (minutes < FROM) return false;
  let rows = await announcementRows(env, community, day), intro = rows.find(row => row.kind === 'intro');
  if (!intro) {
    // Existing days (including legacy 'none') have already had their morning opportunity.
    await env.DB.prepare(`INSERT OR IGNORE INTO discord_announcements(community_id,day,item,kind,position,guild_id,channel_id,created_at,ping_attempted)
      VALUES(?,?,?,'intro',0,?,?,?,?)`).bind(community.id,day,'intro',community.discordGuildId,channel,timestamp,rows.length ? 1 : 0).run();
    rows = await announcementRows(env, community, day);intro = rows.find(row => row.kind === 'intro');
  }
  const prefix = formatPrefix(settings);
  const legacy = rows.some(row => row.kind !== 'intro' && row.message_id && row.message_id !== '-' && (row.message_id !== intro.message_id || row.channel_id !== intro.channel_id));
  const due = intro.pending_nonce || !intro.content_hash?.startsWith(prefix) || legacy || intro.channel_id !== channel || timestamp - Number(intro.checked_at || 0) >= REFRESH_EVERY;
  if (!due) return false;
  let asked = false;
  // A POST may have succeeded even when its response or the subsequent DB write failed.
  // Recover its ID before any retry. Failure to read history fails closed (no second POST).
  if (intro.pending_nonce) {
    const history = await discordRequest(env,'GET',`/channels/${intro.pending_channel_id}/messages?limit=100`,null,budget);
    asked = true;
    if (!Array.isArray(history)) throw new Error('Discord n’a pas confirmé l’historique des annonces.');
    const recovered = history.find(message => String(message.nonce || '') === intro.pending_nonce && message.author?.id === env.DISCORD_CLIENT_ID);
    if (recovered) {
      if (intro.message_id !== recovered.id || intro.channel_id !== intro.pending_channel_id) await retainAnnouncement(env,community,day,intro,timestamp);
      await env.DB.prepare("UPDATE discord_announcements SET message_id=?,channel_id=?,content_hash=?,pending_nonce='',pending_hash='',pending_channel_id='' WHERE community_id=? AND day=? AND item='intro'")
        .bind(recovered.id,intro.pending_channel_id,intro.pending_hash,community.id,day).run();
      intro = {...intro,message_id:recovered.id,channel_id:intro.pending_channel_id,content_hash:intro.pending_hash,pending_nonce:'',pending_hash:'',pending_channel_id:''};
    }
  }
  // Rebuild the eligible list: a late entrant can add a race without another ping.
  const eligible = await announceItems(env,community,timestamp), items = [], activeRows = [];
  for (const row of eligible) {
    const payload = await announcePayload(env,community,row,timestamp,null,stream);
    if (payload) { activeRows.push(row);items.push({name:payload.embeds[0].title.replace(/^[^\p{L}\p{N}]+/u,''),payload}); }
  }
  if (!items.length) {
    // Consume the morning opportunity even on an empty day; remove stale counts silently.
    await env.DB.prepare("UPDATE discord_announcements SET ping_attempted=1 WHERE community_id=? AND day=? AND item='intro'").bind(community.id,day).run();
    const cleanup = await removeOldAnnouncements(env,community,day,null,budget);
    if (cleanup.done) await env.DB.prepare("UPDATE discord_announcements SET message_id=NULL,content_hash=?,checked_at=?,pending_nonce='',pending_hash='',pending_channel_id='' WHERE community_id=? AND day=? AND item='intro'")
      .bind(prefix+'empty',timestamp,community.id,day).run();
    return asked || cleanup.asked;
  }
  for (const [position,row] of activeRows.entries()) await env.DB.prepare(`INSERT OR IGNORE INTO discord_announcements(community_id,day,item,kind,position,guild_id,channel_id,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(community.id,day,row.item,row.kind,position+1,community.discordGuildId,channel,timestamp).run();
  const counts = {events:activeRows.filter(row => row.kind === 'event').length,races:activeRows.filter(row => row.kind === 'race').length,
    lives:activeRows.filter(row => row.kind === 'stream').length,streams:await streamTimes(env,activeRows)};
  const site = {...siteOf(env,community),announceFormat:parseLayout(settings.layout)?.announceFormat,streamUrl:stream,streamName:parseLayout(settings.layout)?.streamName || '',streams:counts.streams};
  const quietIntro = buildAnnounceIntro(counts,site);quietIntro.content='';quietIntro.allowed_mentions={parse:[]};
  const payload = buildCompleteAnnouncement(quietIntro,items,site), hash = await contentHash(payload,prefix);
  const previousId = intro.message_id, previousChannel = intro.channel_id;
  // V2 cannot be reverted in place; a channel move also requires a silent replacement.
  const replace = previousChannel !== channel || (intro.content_hash?.startsWith('components-v2:') && prefix !== 'components-v2:');
  if (previousId && !replace && !intro.pending_nonce) {
    try {
      const changed = hash !== intro.content_hash || legacy;
      const confirmed = await discordRequest(env,changed ? 'PATCH' : 'GET',`/channels/${channel}/messages/${previousId}`,
        changed ? {...payload,...(payload.flags & 32768 ? {content:null,embeds:[]} : {}),allowed_mentions:{parse:[]}} : null,budget);
      if (confirmed?.id !== previousId) throw new Error('Discord n’a pas confirmé le message de l’annonce.');
      asked = true;
    } catch (error) {
      if (error.status !== 404 || error.code !== 10008) throw error;
      intro.message_id = null;
    }
  } else if (replace || intro.pending_nonce) intro.message_id = null;
  if (!intro.message_id) {
    const ping = intro.ping_attempted === 0 && !previousId && !intro.pending_nonce && minutes < UNTIL && counts.events + counts.races > 0;
    // Reserve the only possible mention BEFORE the network call. An ambiguous retry is silent.
    const nonce = intro.pending_nonce || crypto.randomUUID().replaceAll('-','').slice(0,24);
    if (previousId) await retainAnnouncement(env,community,day,{message_id:previousId,channel_id:previousChannel},timestamp);
    const reserved = await env.DB.prepare("UPDATE discord_announcements SET ping_attempted=1,pending_nonce=?,pending_hash=?,pending_channel_id=? WHERE community_id=? AND day=? AND item='intro' AND pending_nonce=? AND ping_attempted=? AND COALESCE(message_id,'')=?")
      .bind(nonce,hash,channel,community.id,day,intro.pending_nonce,intro.ping_attempted,previousId || '').run();
    if (!reserved.meta.changes) return asked;
    const pingPayload = ping ? buildCompleteAnnouncement(buildAnnounceIntro(counts,site),items,site) : {...payload,flags:(payload.flags || 0) | 4096};
    const message = await discordRequest(env,'POST',`/channels/${channel}/messages`,{...pingPayload,nonce,enforce_nonce:true},budget);
    if (!message?.id) throw new Error('Discord n’a pas confirmé la publication de l’annonce.');
    intro.message_id = message.id;asked = true;
  }
  // Persist the replacement before cleanup. Retired references survive interrupted cleanup.
  await env.DB.prepare("UPDATE discord_announcements SET message_id=?,channel_id=?,content_hash=?,checked_at=?,ping_attempted=1,pending_nonce='',pending_hash='',pending_channel_id='' WHERE community_id=? AND day=? AND item='intro'")
    .bind(intro.message_id,channel,hash,timestamp,community.id,day).run();
  const cleanup = await removeOldAnnouncements(env,community,day,`${channel}:${intro.message_id}`,budget);
  for (const row of activeRows) await env.DB.prepare('UPDATE discord_announcements SET message_id=?,channel_id=?,content_hash=?,checked_at=? WHERE community_id=? AND day=? AND item=? AND (message_id IS NULL OR message_id=?)')
    .bind(intro.message_id,channel,hash,timestamp,community.id,day,row.item,intro.message_id).run();
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
