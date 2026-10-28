// « Annonce du jour »: at 7h30 (Paris) the bot announces the day's events and endurances in the channel the admins chose in
// the « Discord » setting (layout.announce, a text or announcement channel). A first message pings @everyone (the community,
// « C'est jour de course ! », what the day holds), then one message per race in the order of its start, each with its hook,
// its rounds or its crews, the count of présents and the buttons « Présent » (the race on the site) and « Absent »
// (server/discord-interactions.mjs). The list is made once in the morning; the counts are refreshed during the day.
import {communityById} from './community.mjs';
import {iracingSoloSql} from './iracing-visibility.mjs';
import {loadWeeklyDiscordSnapshot, siteOf} from './discord-weekly.mjs';
import {buildAnnounceIntro, buildAnnounceEvent, buildAnnounceRace, parisDay} from './discord-weekly-format.mjs';
import {discordRequest, botCategoryEmojis} from './recap-discord.mjs';
import {discordAbsentButton} from './discord-interactions.mjs';
import {parseLayout} from './discord-layout.mjs';
import {simForEvent, tdzOnly} from '../shared/catalog.mjs';
import {grindfestEnabled, isGrindfest, streamersOf} from '../shared/grindfest.mjs';
import {isDevelopment} from './dev-environment.mjs';

const MINUTE = 60000;
// Posted from 7h30 to 9h (Paris): a setting made later in the day waits for the next morning (no @everyone at night).
const FROM = 7 * 60 + 30, UNTIL = 9 * 60;
// Messages sent per pass (the list goes on 2 minutes later, in order), and counts refreshed per pass.
const SENDS = 4, REFRESHES = 2, REFRESH_EVERY = 10 * MINUTE;
const parisMinutes = timestamp => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Paris', hour:'numeric', minute:'numeric', hourCycle:'h23'}).formatToParts(timestamp).map(part => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
};
const parse = (value, fallback) => { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } };
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
// The update time in the footer changes on every pass: not part of what is compared.
const contentHash = payload => digest({...payload, embeds:(payload.embeds || []).map(({footer, ...embed}) => embed)});

// The channel chosen for the announcement, or '' (layout.announce).
export const announceChannel = settings => settings?.enabled === 0 ? '' : String(parseLayout(settings?.layout)?.announce || '');

const SOLO_SQL = (env, community) => `(community_id=? OR community_id='official') AND format='solo' AND ${iracingSoloSql(env, community)}
  ${grindfestEnabled(community, isDevelopment(env)) ? '' : "AND COALESCE(json_extract(details,'$.type'),'') NOT IN ('Gridfest','Grindfest')"}`;
// A start of today still to come (or today with its time to confirm).
const today = (start, day, timestamp, pending) => Number.isFinite(Number(start?.startsAt)) && parisDay(Number(start.startsAt)) === day
  && (pending || start.tbd === true || Number(start.startsAt) > timestamp);

// The day's races of a community, in the order of their first start today: [{item, kind:'event'|'race', startsAt}].
export async function announceItems(env, community, timestamp) {
  const day = parisDay(timestamp), items = [];
  const solo = (await env.DB.prepare(`SELECT id,departures,schedule_pending FROM events WHERE ${SOLO_SQL(env, community)}`).bind(community.id).all()).results || [];
  for (const row of solo) {
    const starts = parse(row.departures, []).filter(start => today(start, day, timestamp, Boolean(row.schedule_pending)));
    if (starts.length) items.push({item:row.id, kind:'event', startsAt:Math.min(...starts.map(start => Number(start.startsAt)))});
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
  const row = await env.DB.prepare(`SELECT id,name,sim,circuit,rounds,capacity,access,details,departures,schedule_pending FROM events WHERE id=? AND ${SOLO_SQL(env, community)}`)
    .bind(id, community.id).first();
  if (!row) return null;
  const day = parisDay(timestamp), start = parse(row.departures, []).find(item => Number.isFinite(Number(item?.startsAt)) && parisDay(Number(item.startsAt)) === day);
  if (!start) return null;
  const details = parse(row.details, {}) || {}, sim = simForEvent(row), tdz = tdzOnly(community, isDevelopment(env));
  const entries = (await env.DB.prepare(`SELECT streamer_id,COUNT(DISTINCT COALESCE(participant_id,id)) AS entered FROM registrations
    WHERE event_id=? AND departure_id=? AND community_id=? AND COALESCE(status,'')<>'unavailable' GROUP BY streamer_id`).bind(row.id, start.id, community.id).all()).results || [];
  const entered = entries.reduce((total, item) => total + Number(item.entered || 0), 0);
  const gridfest = isGrindfest(row), site = siteOf(env, community).url || '';
  return {id:row.id, name:row.name, sim, type:details.type || '', access:tdz ? row.access || 'open' : '', tdz, note:details.note || '',
    startsAt:Number(start.startsAt), timePending:Boolean(row.schedule_pending) || start.tbd === true,
    rounds:parse(row.rounds, []), capacity:row.capacity == null ? null : Number(row.capacity), entered,
    streamers:gridfest ? streamersOf(row).map(streamer => ({name:streamer.name, capacity:streamer.capacity, entered:Number(entries.find(item => item.streamer_id === streamer.id)?.entered || 0)})) : [],
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
// What a row of the announcement shows now (null: the race is gone from the site).
export async function announcePayload(env, community, row, timestamp, counts = null) {
  const site = siteOf(env, community), absent = discordAbsentButton(env);
  if (row.kind === 'intro') return buildAnnounceIntro(counts || {events:0, races:0}, site);
  if (row.kind === 'event') {
    const event = await eventSnapshot(env, community, row.item, timestamp);
    return event ? buildAnnounceEvent(event, site, timestamp, absent) : null;
  }
  const race = await raceSnapshot(env, community, row.item, timestamp);
  return race ? buildAnnounceRace(race, site, timestamp, await botCategoryEmojis(env, timestamp), absent) : null;
}

// One community: today's list made in the morning, its messages sent in order, then the counts kept up to date.
// Returns whether Discord was asked something.
export async function announceCommunity(env, community, settings, timestamp = Date.now()) {
  const channel = announceChannel(settings);
  if (!channel || !community.discordGuildId || settings.guild_id !== community.discordGuildId) return false;
  const day = parisDay(timestamp), budget = {left:SENDS + REFRESHES + 1};
  let rows = (await env.DB.prepare('SELECT * FROM discord_announcements WHERE community_id=? AND day=? ORDER BY position').bind(community.id, day).all()).results || [];
  if (!rows.length) {
    const minutes = parisMinutes(timestamp);
    if (minutes < FROM || minutes >= UNTIL) return false;
    const items = await announceItems(env, community, timestamp);
    // Nothing today: a row says so, no message.
    const planned = items.length ? [{item:'intro', kind:'intro'}, ...items] : [{item:'none', kind:'none'}];
    for (const [position, item] of planned.entries())
      await env.DB.prepare('INSERT OR IGNORE INTO discord_announcements(community_id,day,item,kind,position,guild_id,channel_id,message_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(community.id, day, item.item, item.kind, position, community.discordGuildId, channel, item.kind === 'none' ? '-' : null, timestamp).run();
    rows = (await env.DB.prepare('SELECT * FROM discord_announcements WHERE community_id=? AND day=? ORDER BY position').bind(community.id, day).all()).results || [];
  }
  let asked = false;
  const counts = {events:rows.filter(item => item.kind === 'event').length, races:rows.filter(item => item.kind === 'race').length};
  // In order: Discord keeps messages in the order they were sent.
  for (const row of rows.filter(item => !item.message_id)) {
    if (budget.left < 2) break;
    const payload = await announcePayload(env, community, row, timestamp, counts);
    if (!payload) {
      // Taken off the site since the morning: nothing sent.
      await env.DB.prepare("UPDATE discord_announcements SET message_id='-' WHERE community_id=? AND day=? AND item=?").bind(community.id, day, row.item).run();
      row.message_id = '-';
      continue;
    }
    const nonce = (await digest([community.id, day, row.item])).slice(0, 24);
    // The intro pings everyone; the races below it arrive without a notification of their own.
    const message = await discordRequest(env, 'POST', `/channels/${row.channel_id}/messages`, {...payload, nonce, enforce_nonce:true, ...(row.kind === 'intro' ? {} : {flags:4096})}, budget);
    asked = true;
    await env.DB.prepare('UPDATE discord_announcements SET message_id=?,content_hash=?,checked_at=? WHERE community_id=? AND day=? AND item=?')
      .bind(message.id, await contentHash(payload), timestamp, community.id, day, row.item).run();
    row.message_id = message.id;
  }
  if (rows.some(item => !item.message_id)) return asked;
  // The counts of présents (and anything else changed on the site): the races checked longest ago, edited when changed.
  const due = rows.filter(item => ['event','race'].includes(item.kind) && item.message_id !== '-' && timestamp - Number(item.checked_at || 0) >= REFRESH_EVERY)
    .sort((a, b) => Number(a.checked_at) - Number(b.checked_at)).slice(0, REFRESHES);
  for (const row of due) {
    const payload = await announcePayload(env, community, row, timestamp);
    const hash = payload ? await contentHash(payload) : row.content_hash;
    if (payload && hash !== row.content_hash) {
      await discordRequest(env, 'PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, payload, budget).catch(error => {
        // The message deleted on Discord: left alone.
        if (error.status !== 404) throw error;
      });
      asked = true;
    }
    await env.DB.prepare('UPDATE discord_announcements SET content_hash=?,checked_at=? WHERE community_id=? AND day=? AND item=?').bind(hash, timestamp, community.id, day, row.item).run();
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
