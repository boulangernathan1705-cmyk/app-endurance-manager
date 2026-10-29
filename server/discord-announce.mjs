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
// Posted from 7h30 to 9h (Paris), or at once the day the announcement is turned on (from 7h30).
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
  for (const row of solo) {
    const starts = parse(row.departures, []).filter(start => today(start, day, timestamp, Boolean(row.schedule_pending)));
    // A stream (« Annoncer un stream ») has its own card, without « Présent » nor « Absent ».
    if (starts.length) items.push({item:row.id, kind:isStream(row) ? 'stream' : 'event', startsAt:Math.min(...starts.map(start => Number(start.startsAt)))});
  }
  // The endurances as in the week's message (official LMU ones included, iRacing ones as the community shows them).
  const snapshot = await loadWeeklyDiscordSnapshot(env, timestamp, community, 'all');
  for (const departure of snapshot.futureDepartures.filter(item => parisDay(item.startsAt) === day)) {
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
  const day = parisDay(timestamp), start = parse(row.departures, []).find(item => Number.isFinite(Number(item?.startsAt)) && parisDay(Number(item.startsAt)) === day);
  if (!start) return null;
  const details = parse(row.details, {}) || {}, sim = simForEvent(row), tdz = tdzOnly(community, isDevelopment(env));
  if (isStream(row)) return {id:row.id, name:row.name, startsAt:Number(start.startsAt), stream:{...streamDetails({details}), crew:await streamCrew(env, community.id, row)}};
  const entries = (await env.DB.prepare(`SELECT streamer_id,COUNT(DISTINCT COALESCE(participant_id,id)) AS entered FROM registrations
    WHERE event_id=? AND departure_id=? AND community_id=? AND COALESCE(status,'')<>'unavailable' GROUP BY streamer_id`).bind(row.id, start.id, community.id).all()).results || [];
  const entered = entries.reduce((total, item) => total + Number(item.entered || 0), 0);
  const gridfest = isGrindfest(row), site = siteOf(env, community).url || '';
  return {id:row.id, name:row.name, sim, type:normalizeTdzEventType(details.type) || '', access:tdz ? row.access || 'open' : '', tdz, note:details.note || '',
    startsAt:Number(start.startsAt), timePending:Boolean(row.schedule_pending) || start.tbd === true,
    rounds:parse(row.rounds, []), capacity:row.capacity == null ? null : Number(row.capacity), entered,
    streamers:gridfest ? streamersOf(row).map(streamer => ({name:streamer.name, twitchUrl:streamer.twitchUrl, capacity:streamer.capacity, entered:Number(entries.find(item => item.streamer_id === streamer.id)?.entered || 0)})) : [],
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
  const departures = snapshot.futureDepartures.filter(item => parisDay(item.startsAt) === day);
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
  const channel = announceChannel(settings), stream = announceStream(settings);
  if (!channel || !community.discordGuildId || settings.guild_id !== community.discordGuildId) return false;
  const day = parisDay(timestamp), budget = {left:REQUESTS};
  let rows = (await env.DB.prepare('SELECT * FROM discord_announcements WHERE community_id=? AND day=? ORDER BY position').bind(community.id, day).all()).results || [];
  if (!rows.length) {
    // The day it is turned on, at once (from 7h30): the races left today.
    const minutes = parisMinutes(timestamp), since = Number(parseLayout(settings.layout)?.announceAt) || 0;
    const justOn = since && since <= timestamp && parisDay(since) === day;
    if (minutes < FROM || (minutes >= UNTIL && !justOn)) return false;
    const items = await announceItems(env, community, timestamp);
    // Nothing today: a row says so, no message.
    const planned = items.length ? [{item:'intro', kind:'intro'}, ...items] : [{item:'none', kind:'none'}];
    for (const [position, item] of planned.entries())
      await env.DB.prepare('INSERT OR IGNORE INTO discord_announcements(community_id,day,item,kind,position,guild_id,channel_id,message_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(community.id, day, item.item, item.kind, position, community.discordGuildId, channel, item.kind === 'none' ? '-' : null, timestamp).run();
    rows = (await env.DB.prepare('SELECT * FROM discord_announcements WHERE community_id=? AND day=? ORDER BY position').bind(community.id, day).all()).results || [];
  }
  const intro=rows.find(row=>row.kind==='intro');
  if(!intro)return false;
  const legacy=rows.filter(row=>row.kind!=='intro' && row.message_id && row.message_id!=='-' && row.message_id!==intro.message_id);
  const prefix=formatPrefix(settings);
  const due=!intro.message_id || !intro.content_hash?.startsWith(prefix) || legacy.length || timestamp-Number(intro.checked_at||0)>=REFRESH_EVERY;
  if(!due)return false;
  const counts={events:rows.filter(row=>row.kind==='event').length,races:rows.filter(row=>row.kind==='race').length,
    lives:rows.filter(row=>row.kind==='stream').length,streams:await streamTimes(env,rows)};
  const items=[];
  const eventRows=rows.filter(row=>['event','race','stream'].includes(row.kind));
  for(const row of eventRows.slice(0,9)) {
    const payload=await announcePayload(env,community,row,timestamp,null,stream);
    if(payload)items.push({name:payload.embeds[0].title.replace(/^[^\p{L}\p{N}]+/u,''),payload});
  }
  items.push(...eventRows.slice(9).map(row=>({name:row.item,payload:{embeds:[],components:[]}})));
  const site={...siteOf(env,community),announceFormat:parseLayout(settings.layout)?.announceFormat,streamUrl:stream,streamName:parseLayout(settings.layout)?.streamName||'',streams:counts.streams};
  const payload=buildCompleteAnnouncement(buildAnnounceIntro(counts,site),items,site);
  const hash=await contentHash(payload,prefix);
  let asked=false;
  const previousId=intro.message_id;
  // A V2 flag cannot be removed. Switching back publishes a silent replacement;
  // the previous message remains until that publication is confirmed and saved.
  if(previousId && intro.content_hash?.startsWith('components-v2:') && prefix!=='components-v2:') intro.message_id=null;
  if(intro.message_id) {
    try {
      // Even unchanged content must still exist before the old cards can be removed.
      const confirmed=await discordRequest(env,hash!==intro.content_hash||legacy.length?'PATCH':'GET',
        `/channels/${intro.channel_id}/messages/${previousId}`,
        hash!==intro.content_hash||legacy.length?{...payload,...(payload.flags&32768?{content:null,embeds:[]}:{}),allowed_mentions:{parse:[]}}:null,budget);
      if(confirmed?.id!==previousId)throw new Error('Discord n’a pas confirmé le message de remplacement.');
      asked=true;
    } catch(error) {
      if(error.status!==404 || error.code!==10008)throw error;
      intro.message_id=null;
    }
  }
  if(!intro.message_id) {
    const nonce=(await digest([community.id,day,'complete',prefix,previousId||'initial'])).slice(0,24);
    const message=await discordRequest(env,'POST',`/channels/${intro.channel_id}/messages`,{
      ...payload,nonce,enforce_nonce:true,
      ...(previousId?{allowed_mentions:{parse:[]},flags:(payload.flags||0)|4096}:{})
    },budget);
    if(!message?.id)throw new Error('Discord n’a pas confirmé la publication de l’annonce.');
    intro.message_id=message.id;asked=true;
  }
  // Persist the combined publication before cleanup; an interrupted cleanup resumes next pass.
  await env.DB.prepare('UPDATE discord_announcements SET message_id=?,content_hash=?,checked_at=? WHERE community_id=? AND day=? AND item=?')
    .bind(intro.message_id,hash,timestamp,community.id,day,'intro').run();
  for(const row of rows.filter(row=>row.kind!=='intro')) {
    if(row.message_id && row.message_id!=='-' && row.message_id!==intro.message_id) {
      if(budget.left<=0)break;
      await discordRequest(env,'DELETE',`/channels/${row.channel_id}/messages/${row.message_id}`,null,budget)
        .catch(error=>{if(error.status!==404)throw error;});
      asked=true;
    }
    await env.DB.prepare('UPDATE discord_announcements SET message_id=?,content_hash=?,checked_at=? WHERE community_id=? AND day=? AND item=?')
      .bind(intro.message_id,hash,timestamp,community.id,day,row.item).run();
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
