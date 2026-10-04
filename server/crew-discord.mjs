// Crews on Discord (migration 0044). Two modules, each enabled by the admins of a community:
// - crewChannels (« Équipages sur Discord »): a few days before its start, every crew with a pilot gets a thread
//   (in the channel chosen by the admins, open to the whole server) and a voice channel. A recap message in the
//   thread follows the crew (race, time, car, pilots); a pilot who joins is welcomed there, which adds him to
//   the thread. 24 h after the planned end the thread is archived and the voice channel deleted (once no pilot
//   of the crew is in it). A crew deleted before is closed at once.
// - raceReminders (« Rappels de course »): 24 h and 1 h before the start, a message in the crew's thread that
//   mentions its pilots; 24 h before, a notification on the bell for every pilot entered on the start.
// Everything is done by the bot (DISCORD_BOT_TOKEN) through Discord's REST API, by the scheduled task and right
// after a change on a crew, a few requests at a time (a run of the Worker may make 50).
import {allCommunities, communityUrl} from './community.mjs';
import {notify} from './notifications.mjs';
import {durationLabel} from '../shared/duration.mjs';

const DISCORD_API = 'https://discord.com/api/v10';
const HOUR = 3600_000;
// A thread with no message for 7 days is archived by Discord: it is opened 6 days before the start at most.
export const OPEN_BEFORE = 6 * 24 * HOUR;
export const CLOSE_AFTER = 24 * HOUR;
// After this, a crew whose thread or voice channel cannot be closed (bot removed…) is left alone.
const GIVE_UP_AFTER = 7 * 24 * HOUR;
const LOCK_MS = 60_000;
export const REMINDERS = [{bit:1, before:24 * HOUR}, {bit:2, before:HOUR}];
// What the bot needs on the server for the crews (invite link of the « Mise en place » page): view channels,
// manage channels (voice channels), send messages, read the history, manage threads, create public threads,
// send messages in threads.
export const CREW_BOT_PERMISSIONS = String((1n << 4n) | (1n << 10n) | (1n << 11n) | (1n << 16n) | (1n << 34n) | (1n << 35n) | (1n << 38n));
const TEXT = 0, VOICE = 2, CATEGORY = 4, PUBLIC_THREAD = 11, FORUM = 15;

class Stop extends Error {}

// One request to Discord as the bot. `budget.left` requests may still be made in this run; a rate limit stops it.
async function discord(env, budget, method, path, body) {
  if (budget.left <= 0) throw new Stop('budget');
  budget.left -= 1;
  const response = await fetch(`${DISCORD_API}${path}`, {method, signal:AbortSignal.timeout(8000),
    headers:{Authorization:`Bot ${String(env.DISCORD_BOT_TOKEN || '').trim()}`, ...(body ? {'Content-Type':'application/json'} : {})},
    body:body ? JSON.stringify(body) : undefined});
  if (response.status === 429) { budget.left = 0; throw new Stop('rate-limited'); }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Discord ${response.status}${data?.code ? ` (${data.code})` : ''}`);
    error.status = response.status; error.code = data?.code;
    throw error;
  }
  return data;
}

// What an admin can do when the bot is refused.
function errorText(error) {
  if (error?.status === 403) return 'Le bot n’a pas les droits nécessaires : clique sur « Donner les droits au bot » et vérifie qu’il peut voir le salon choisi.';
  if (error?.status === 404) return 'Le salon ou la catégorie choisis n’existent plus sur ton serveur : choisis-en un autre.';
  return 'Discord n’a pas répondu : le bot réessaiera tout seul.';
}

const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const clip = (value, size) => { const text = String(value || '').trim(); return text.length > size ? `${text.slice(0, size - 1)}…` : text; };
const game = circuit => String(circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';
// No mention or link can be slipped in through a name chosen on the site.
const safe = value => String(value || '').replace(/[@#<>*_~`|\\[\]]/g, '').replace(/\s+/g, ' ').trim();

// The start of the crew and when its race ends, or null (start gone, or its time not known yet).
function startOf(row) {
  const departure = parse(row.departures, []).find(item => item?.id === row.departure_id);
  const startsAt = Number(departure?.startsAt);
  if (!departure || !Number.isFinite(startsAt)) return null;
  const minutes = Number(row.duration_minutes) || (Number(row.duration_hours) || 0) * 60;
  return {startsAt, endsAt:startsAt + minutes * 60_000, minutes, pending:Boolean(row.schedule_pending) || departure.tbd === true};
}

// The recap message of the thread.
function recapContent(env, community, row, start, pilots, voiceId) {
  const unix = Math.floor(start.startsAt / 1000);
  const names = pilots.map(pilot => pilot.user_id && /^\d{15,22}$/.test(pilot.user_id) ? `<@${pilot.user_id}>` : safe(pilot.name)).filter(Boolean);
  let link = '';
  try { link = `${communityUrl(env, community)}/${game(row.circuit)}/#event=${row.event_id}`; } catch {}
  return [
    `🏁 **${safe(row.event_name)}** · ${game(row.circuit) === 'iracing' ? 'iRacing' : 'LMU'}`,
    start.pending ? '🕐 Horaire à confirmer' : `🕐 <t:${unix}:F> (<t:${unix}:R>)`,
    start.minutes ? `⏱️ ${durationLabel(start.minutes)}` : '',
    `🚗 ${safe(row.car) || 'Voiture à choisir'} · ${safe(row.category)}`,
    `👥 Équipage **${safe(row.crew_name)}** : ${names.join(', ') || 'personne pour l’instant'}`,
    voiceId ? `🔊 Salon vocal : <#${voiceId}>` : '',
    link ? `🔗 Inscriptions et équipage : ${link}` : ''
  ].filter(Boolean).join('\n');
}

async function hash(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
const discordIds = pilots => [...new Set(pilots.map(pilot => pilot.user_id).filter(id => /^\d{15,22}$/.test(id || '')))];

// The crews with their race (rows of crew_discord, or crews about to get one).
const CREW_COLUMNS = `c.id AS crew_id, c.community_id, c.name AS crew_name, c.car, c.category, c.departure_id, c.event_id,
  e.name AS event_name, e.departures, e.duration_hours, e.duration_minutes, e.circuit, e.schedule_pending`;

async function pilotsOf(env, crewIds) {
  const byCrew = new Map(crewIds.map(crewId => [crewId, []]));
  if (!crewIds.length) return byCrew;
  const rows = (await env.DB.prepare(`SELECT cm.crew_id, p.user_id, COALESCE(p.name, r.name) AS name FROM crew_members cm
    JOIN registrations r ON r.id=cm.registration_id JOIN participants p ON p.id=r.participant_id
    WHERE cm.crew_id IN (${crewIds.map(() => '?').join(',')}) ORDER BY r.created_at, r.id`).bind(...crewIds).all()).results || [];
  for (const row of rows) byCrew.get(row.crew_id)?.push(row);
  return byCrew;
}

// Keeps the crews of the communities with the modules on Discord. `community`: only this one (after a change
// on its site); `requests`: the most requests made to Discord in this run.
export async function syncCrewDiscord(env, timestamp = Date.now(), {community = null, requests = 8, bell = !community} = {}) {
  if (!env?.DB || !String(env.DISCORD_BOT_TOKEN || '').trim()) return {skipped:'not-configured'};
  const budget = {left:requests};
  const communities = new Map((community ? [community] : await allCommunities(env)).map(item => [item.id, item]));
  const settings = new Map(((await env.DB.prepare('SELECT * FROM community_crew_discord').all()).results || []).map(row => [row.community_id, row]));
  const withThreads = [...communities.values()].filter(item => item.modules?.crewChannels === true && item.discordGuildId && settings.has(item.id));
  const report = {opened:0, updated:0, closed:0, reminded:0};

  // New crews: a row for each crew with a pilot whose start comes within OPEN_BEFORE (its time known).
  if (withThreads.length) {
    const candidates = (await env.DB.prepare(`SELECT ${CREW_COLUMNS} FROM crews c JOIN events e ON e.id=c.event_id
      WHERE c.community_id IN (${withThreads.map(() => '?').join(',')}) AND e.schedule_pending=0
        AND NOT EXISTS(SELECT 1 FROM crew_discord d WHERE d.crew_id=c.id) AND EXISTS(SELECT 1 FROM crew_members m WHERE m.crew_id=c.id)
        AND EXISTS(SELECT 1 FROM json_each(e.departures) j WHERE json_extract(j.value,'$.id')=c.departure_id
          AND COALESCE(json_extract(j.value,'$.tbd'),0)=0 AND json_extract(j.value,'$.startsAt') BETWEEN ? AND ?)
      LIMIT 20`).bind(...withThreads.map(item => item.id), timestamp - 2 * 24 * HOUR, timestamp + OPEN_BEFORE).all()).results || [];
    const fresh = candidates.filter(row => { const start = startOf(row); return start && !start.pending && timestamp < start.endsAt; });
    if (fresh.length) await env.DB.batch(fresh.map(row => env.DB.prepare('INSERT OR IGNORE INTO crew_discord(crew_id,community_id,guild_id,created_at) VALUES(?,?,?,?)')
      .bind(row.crew_id, row.community_id, communities.get(row.community_id).discordGuildId, timestamp)));
  }

  // Open rows, checked longest ago first. Only those with something to do on Discord are locked and worked on
  // (a run of the Worker may also make only 50 calls to the database).
  const ids = [...communities.keys()];
  if (!ids.length) return report;
  const rows = (await env.DB.prepare(`SELECT d.crew_id AS row_id, d.community_id AS row_community, d.guild_id, d.thread_id, d.message_id, d.voice_id, d.recap_hash, d.members,
      d.starts_at, d.reminded, d.created_at, ${CREW_COLUMNS}
    FROM crew_discord d LEFT JOIN crews c ON c.id=d.crew_id LEFT JOIN events e ON e.id=c.event_id
    WHERE d.closed_at IS NULL AND d.community_id IN (${ids.map(() => '?').join(',')}) AND d.lock_until<? ORDER BY d.checked_at LIMIT 40`)
    .bind(...ids, timestamp).all()).results || [];
  const pilots = await pilotsOf(env, rows.filter(row => row.crew_id).map(row => row.crew_id));
  const checked = [];
  for (const row of rows) {
    if (budget.left <= 0) break;
    const owner = communities.get(row.row_community), setting = settings.get(row.row_community), crewPilots = pilots.get(row.crew_id) || [];
    checked.push(row.row_id);
    if (!await needsWork(env, timestamp, owner, setting, row, crewPilots)) continue;
    const lock = await env.DB.prepare('UPDATE crew_discord SET lock_until=? WHERE crew_id=? AND lock_until<? AND closed_at IS NULL').bind(timestamp + LOCK_MS, row.row_id, timestamp).run();
    if (!lock.meta.changes) continue;
    try {
      const done = await syncRow(env, budget, timestamp, owner, setting, row, crewPilots);
      if (done) report[done] += 1;
    } catch (error) {
      if (!(error instanceof Stop)) {
        console.error('Crew Discord sync failed', owner?.slug, error instanceof Error ? error.message : 'unknown');
        if (error?.status === 403 || error?.status === 404) await env.DB.prepare('UPDATE community_crew_discord SET last_error=?, last_error_at=? WHERE community_id=?')
          .bind(errorText(error), Math.floor(timestamp / 1000), row.row_community).run().catch(() => {});
      }
    } finally {
      await env.DB.prepare('UPDATE crew_discord SET lock_until=0 WHERE crew_id=?').bind(row.row_id).run().catch(() => {});
    }
  }
  if (checked.length) await env.DB.prepare(`UPDATE crew_discord SET checked_at=? WHERE crew_id IN (${checked.map(() => '?').join(',')})`).bind(timestamp, ...checked).run();

  // Reminders on the bell: every pilot entered on a start beginning within 24 h (scheduled task only).
  if (bell) report.reminded += await bellReminders(env, timestamp, [...communities.values()].filter(item => item.modules?.raceReminders === true));
  return report;
}

// Reminders of the thread due now (the closest one is sent, the others are counted as sent).
function dueReminders(community, row, start, timestamp) {
  if (community.modules?.raceReminders !== true || start.pending || start.startsAt <= timestamp) return [];
  const reminded = Number(row.starts_at) === start.startsAt ? Number(row.reminded) || 0 : 0;
  return REMINDERS.filter(item => !(reminded & item.bit) && start.startsAt - timestamp <= item.before);
}

// Whether a row has anything to do on Discord now (most of them have not).
async function needsWork(env, timestamp, community, setting, row, pilots) {
  const start = row.crew_id && row.event_name ? startOf(row) : null;
  if (!start || !community || timestamp >= start.endsAt + CLOSE_AFTER) return true;
  if (community.modules?.crewChannels !== true || !setting) return false;
  if (!row.voice_id || !row.thread_id || !row.message_id || Number(row.starts_at) !== start.startsAt) return true;
  const current = discordIds(pilots), known = JSON.parse(row.members || '[]');
  if (current.length !== known.length || current.some(id => !known.includes(id))) return true;
  if (dueReminders(community, row, start, timestamp).length) return true;
  return row.recap_hash !== await hash(recapContent(env, community, row, start, pilots, row.voice_id));
}

async function closeRow(env, budget, timestamp, row, members, {force = false} = {}) {
  if (row.voice_id) {
    // A pilot of the crew still talking in the voice channel: it stays until the next check.
    if (!force) for (const userId of members) {
      try {
        const state = await discord(env, budget, 'GET', `/guilds/${row.guild_id}/voice-states/${userId}`);
        if (state?.channel_id === row.voice_id) return false;
      } catch (error) { if (error instanceof Stop) throw error; }
    }
    try { await discord(env, budget, 'DELETE', `/channels/${row.voice_id}`); }
    catch (error) { if (error?.status !== 404) throw error; }
    await env.DB.prepare('UPDATE crew_discord SET voice_id=NULL WHERE crew_id=?').bind(row.row_id).run();
    row.voice_id = null;
  }
  if (row.thread_id) {
    try { await discord(env, budget, 'PATCH', `/channels/${row.thread_id}`, {archived:true, locked:true}); }
    catch (error) { if (error?.status !== 404) throw error; }
  }
  await env.DB.prepare('UPDATE crew_discord SET closed_at=? WHERE crew_id=?').bind(timestamp, row.row_id).run();
  return true;
}

// A message in the thread, which Discord may have archived (no message for 7 days): opened again if needed.
// A thread or recap message deleted by someone on Discord is made again at the next check.
async function sendInThread(env, budget, row, method, path, body) {
  try { return await discord(env, budget, method, path, body); }
  catch (error) {
    if (error?.code === 10003 || error?.code === 10008) {
      await env.DB.prepare(`UPDATE crew_discord SET ${error.code === 10003 ? 'thread_id=NULL, ' : ''}message_id=NULL WHERE crew_id=?`).bind(row.row_id).run();
      throw new Stop('gone');
    }
    if (error?.code !== 50083) throw error;
    await discord(env, budget, 'PATCH', `/channels/${row.thread_id}`, {archived:false});
    return discord(env, budget, method, path, body);
  }
}

async function syncRow(env, budget, timestamp, community, setting, row, pilots) {
  const start = row.crew_id && row.event_name ? startOf(row) : null;
  const members = JSON.parse(row.members || '[]');
  // Crew, race or start gone: closed now.
  if (!start || !community) {
    try { return await closeRow(env, budget, timestamp, row, members, {force:true}) ? 'closed' : null; }
    catch (error) {
      if (error instanceof Stop || timestamp - row.created_at < GIVE_UP_AFTER) throw error;
      await env.DB.prepare('UPDATE crew_discord SET closed_at=? WHERE crew_id=?').bind(timestamp, row.row_id).run();
      return 'closed';
    }
  }
  // 24 h after the planned end (or the module turned off once the race is over).
  if (timestamp >= start.endsAt + CLOSE_AFTER) {
    try { return await closeRow(env, budget, timestamp, row, members) ? 'closed' : null; }
    catch (error) {
      if (error instanceof Stop || timestamp < start.endsAt + GIVE_UP_AFTER) throw error;
      await env.DB.prepare('UPDATE crew_discord SET closed_at=? WHERE crew_id=?').bind(timestamp, row.row_id).run();
      return 'closed';
    }
  }
  // Module turned off, or no channel chosen any more: nothing new on Discord (what exists closes at the end).
  if (community.modules?.crewChannels !== true || !setting) return null;

  const current = discordIds(pilots);
  let opened = false;
  if (!row.voice_id) {
    const voice = await discord(env, budget, 'POST', `/guilds/${row.guild_id}/channels`,
      {name:clip(`🔊 ${safe(row.crew_name) || 'Équipage'}`, 100), type:VOICE, ...(setting.voice_category_id ? {parent_id:setting.voice_category_id} : {})});
    row.voice_id = voice.id;
    await env.DB.prepare('UPDATE crew_discord SET voice_id=? WHERE crew_id=?').bind(voice.id, row.row_id).run();
  }
  const content = recapContent(env, community, row, start, pilots, row.voice_id);
  const contentHash = await hash(content);
  if (!row.thread_id) {
    const name = clip(`${safe(row.crew_name) || 'Équipage'} · ${safe(row.event_name)}`, 100);
    if (setting.thread_channel_forum) {
      // A forum post starts with its message: the recap.
      const thread = await discord(env, budget, 'POST', `/channels/${setting.thread_channel_id}/threads`, {name, auto_archive_duration:10080, message:{content, allowed_mentions:{users:current}}});
      Object.assign(row, {thread_id:thread.id, message_id:thread.message?.id || thread.id, recap_hash:contentHash, members:JSON.stringify(current)});
      await env.DB.prepare('UPDATE crew_discord SET thread_id=?, message_id=?, recap_hash=?, members=? WHERE crew_id=?').bind(row.thread_id, row.message_id, contentHash, row.members, row.row_id).run();
    } else {
      const thread = await discord(env, budget, 'POST', `/channels/${setting.thread_channel_id}/threads`, {name, type:PUBLIC_THREAD, auto_archive_duration:10080});
      row.thread_id = thread.id;
      await env.DB.prepare('UPDATE crew_discord SET thread_id=? WHERE crew_id=?').bind(thread.id, row.row_id).run();
    }
    await env.DB.prepare('UPDATE community_crew_discord SET last_error=NULL, last_error_at=NULL WHERE community_id=?').bind(community.id).run();
    opened = true;
  }
  if (!row.message_id) {
    // Mentioned in the first message: the pilots are added to the thread and told by Discord.
    const message = await sendInThread(env, budget, row, 'POST', `/channels/${row.thread_id}/messages`, {content, allowed_mentions:{users:current}});
    Object.assign(row, {message_id:message.id, recap_hash:contentHash, members:JSON.stringify(current)});
    await env.DB.prepare('UPDATE crew_discord SET message_id=?, recap_hash=?, members=? WHERE crew_id=?').bind(message.id, contentHash, row.members, row.row_id).run();
  } else {
    if (row.recap_hash !== contentHash) {
      await sendInThread(env, budget, row, 'PATCH', `/channels/${row.thread_id}/messages/${row.message_id}`, {content, allowed_mentions:{parse:[]}});
      await env.DB.prepare('UPDATE crew_discord SET recap_hash=? WHERE crew_id=?').bind(contentHash, row.row_id).run();
    }
    // New pilots: welcomed in the thread (the mention adds them to it).
    const before = JSON.parse(row.members || '[]'), known = new Set(before), joined = current.filter(id => !known.has(id));
    if (joined.length) await sendInThread(env, budget, row, 'POST', `/channels/${row.thread_id}/messages`,
      {content:`👋 Bienvenue ${joined.map(id => `<@${id}>`).join(', ')} dans l’équipage **${safe(row.crew_name)}** !`, allowed_mentions:{users:joined}});
    if (joined.length || current.length !== before.length) await env.DB.prepare('UPDATE crew_discord SET members=? WHERE crew_id=?').bind(JSON.stringify(current), row.row_id).run();
  }

  // Reminders in the thread (a moved start counts them again).
  if (Number(row.starts_at) !== start.startsAt) {
    Object.assign(row, {starts_at:start.startsAt, reminded:0});
    await env.DB.prepare('UPDATE crew_discord SET starts_at=?, reminded=0 WHERE crew_id=?').bind(start.startsAt, row.row_id).run();
  }
  const due = dueReminders(community, row, start, timestamp);
  if (due.length) {
    let reminded = Number(row.reminded) || 0;
    // Only the closest one is sent (a crew opened 30 min before its start gets the « 1 h » one alone).
    const last = due[due.length - 1], unix = Math.floor(start.startsAt / 1000);
    const who = current.map(id => `<@${id}>`).join(' ');
    const content = last.before <= HOUR
      ? `⏰ ${who} Départ <t:${unix}:R> ! On se retrouve dans <#${row.voice_id}>.`
      : `⏰ ${who} Rappel : **${safe(row.event_name)}**, départ <t:${unix}:F> (<t:${unix}:R>).`;
    await sendInThread(env, budget, row, 'POST', `/channels/${row.thread_id}/messages`, {content:content.replace(/ {2,}/g, ' '), allowed_mentions:{users:current}});
    for (const item of due) reminded |= item.bit;
    await env.DB.prepare('UPDATE crew_discord SET reminded=? WHERE crew_id=?').bind(reminded, row.row_id).run();
  }
  return opened ? 'opened' : 'updated';
}

// The bell, 24 h before a start: every pilot entered there in the community, with his crew and its thread.
async function bellReminders(env, timestamp, communities) {
  if (!communities.length) return 0;
  let told = 0;
  // The starts of the coming 24 h with pilots of a community not reminded yet (a few per run), in one query.
  const starts = (await env.DB.prepare(`SELECT k.value AS community_id, e.id, e.name, e.circuit, e.community_id AS event_community,
      json_extract(j.value,'$.id') AS departure_id, json_extract(j.value,'$.startsAt') AS starts_at
    FROM json_each(?) k, events e, json_each(e.departures) j
    WHERE (e.community_id=k.value OR e.community_id='official') AND e.schedule_pending=0 AND COALESCE(json_extract(j.value,'$.tbd'),0)=0
      AND json_extract(j.value,'$.startsAt') > ? AND json_extract(j.value,'$.startsAt') <= ?
      AND EXISTS(SELECT 1 FROM registrations g WHERE g.event_id=e.id AND g.departure_id=json_extract(j.value,'$.id') AND g.community_id=k.value)
      AND NOT EXISTS(SELECT 1 FROM race_reminders r WHERE r.event_id=e.id AND r.departure_id=json_extract(j.value,'$.id') AND r.community_id=k.value)
    LIMIT 3`).bind(JSON.stringify(communities.map(item => item.id)), timestamp, timestamp + REMINDERS[0].before).all()).results || [];
  for (const start of starts) {
    // Marked first: a reminder is never sent twice, even if the run stops halfway.
    const mark = await env.DB.prepare('INSERT OR IGNORE INTO race_reminders(event_id,departure_id,community_id,sent_at) VALUES(?,?,?,?)').bind(start.id, start.departure_id, start.community_id, timestamp).run();
    if (!mark.meta.changes) continue;
    const entries = (await env.DB.prepare(`SELECT DISTINCT p.user_id, c.id AS crew_id, c.name AS crew_name, d.thread_id, d.guild_id FROM registrations r
        JOIN participants p ON p.id=r.participant_id
        LEFT JOIN crew_members cm ON cm.registration_id=r.id LEFT JOIN crews c ON c.id=cm.crew_id
        LEFT JOIN crew_discord d ON d.crew_id=c.id AND d.closed_at IS NULL AND d.thread_id IS NOT NULL
      WHERE r.event_id=? AND r.departure_id=? AND r.community_id=? AND p.user_id IS NOT NULL AND r.status!='unavailable'`)
      .bind(start.id, start.departure_id, start.community_id).all()).results || [];
    // One notification per crew (its name and thread), one for the pilots without a crew.
    const groups = new Map();
    for (const entry of entries) {
      const key = entry.crew_id || '';
      if (!groups.has(key)) groups.set(key, {entry, users:[]});
      groups.get(key).users.push(entry.user_id);
    }
    const event = {id:start.id, name:start.name, circuit:start.circuit, community_id:start.event_community};
    const departure = {startsAt:Number(start.starts_at), tbd:false};
    for (const {entry, users} of groups.values()) {
      const data = entry.crew_id ? {crewName:entry.crew_name, ...(entry.thread_id ? {threadUrl:`https://discord.com/channels/${entry.guild_id}/${entry.thread_id}`} : {})} : {};
      told += await notify(env, users.map(user_id => ({user_id, community_id:start.community_id})), 'race_reminder', event, {departure, ...data});
    }
  }
  return told;
}

// « Mise en place »: the channels of the server the admins can choose (text or forum channels for the threads,
// categories for the voice channels), or null when the bot cannot read them.
export async function guildChannels(env, guildId) {
  if (!guildId || !String(env.DISCORD_BOT_TOKEN || '').trim()) return null;
  try {
    const list = await discord(env, {left:1}, 'GET', `/guilds/${guildId}/channels`);
    const sorted = (Array.isArray(list) ? list : []).sort((a, b) => (a.position || 0) - (b.position || 0));
    return {threads:sorted.filter(item => item.type === TEXT || item.type === FORUM).map(item => ({id:String(item.id), name:String(item.name || ''), forum:item.type === FORUM})),
      categories:sorted.filter(item => item.type === CATEGORY).map(item => ({id:String(item.id), name:String(item.name || '')}))};
  } catch (error) {
    if (!(error instanceof Stop)) console.error('Guild channels failed', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}
