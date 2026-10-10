// Independent crew voices, coordinated with event text recaps when both modules are enabled.
import {allCommunities, communityUrl} from './community.mjs';
import {notify} from './notifications.mjs';
import {durationLabel} from '../shared/duration.mjs';
import {crewDeletionTime, COURSE_CLOSE_AFTER, courseCategory, coordinatesCourse} from './discord-course-space.mjs';
import {syncBotRecaps} from './recap-discord.mjs';

const DISCORD_API = 'https://discord.com/api/v10';
const HOUR = 3600_000;
export const CLOSE_AFTER = COURSE_CLOSE_AFTER;
const LOCK_MS = 60_000;
// Text channels archived by the first version: deleted 30 days after their race.
export const KEEP_ARCHIVES = 30 * 24 * HOUR;
export const REMINDERS = [{bit:1, before:24 * HOUR}, {bit:2, before:HOUR}];
// What the bot needs on the server for the crews (invite link of the « Modules » settings): view channels,
// manage channels, send messages, read the history, connect and speak (to grant public voice access).
const MANAGE_CHANNELS = 1n << 4n, SEND_MESSAGES = 1n << 11n, ADMINISTRATOR = 1n << 3n;
const NEEDED = MANAGE_CHANNELS | (1n << 10n) | SEND_MESSAGES | (1n << 16n) | (1n << 20n) | (1n << 21n);
export const CREW_BOT_PERMISSIONS = String(NEEDED);
const VOICE = 2, CATEGORY = 4;
const PUBLIC_VOICE = String((1n << 10n) | (1n << 20n) | (1n << 21n));

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
  if (error?.status === 403) return 'Le bot n’a pas les droits nécessaires : clique sur « Donner les droits au bot ».';
  return 'Discord n’a pas répondu : le bot réessaiera tout seul.';
}

const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const clip = (value, size) => { const text = String(value || '').trim(); return text.length > size ? `${text.slice(0, size - 1)}…` : text; };
const game = circuit => String(circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';
// No mention or link can be slipped in through a name chosen on the site.
const safe = value => String(value || '').replace(/[@#<>*_~`|\\[\]]/g, '').replace(/\s+/g, ' ').trim();

// The crew departure, with an explicit pending state when its time is not known.
function startOf(row) {
  const departure = parse(row.departures, []).find(item => item?.id === row.departure_id);
  const startsAt = Number(departure?.startsAt);
  const known = departure?.startsAt != null && departure.startsAt !== '' && Number.isFinite(startsAt);
  const minutes = Number(row.duration_minutes) || (Number(row.duration_hours) || 0) * 60;
  return {startsAt:known ? startsAt : null, minutes, pending:!known || Boolean(row.schedule_pending) || departure.tbd === true};
}

// The recap message of the voice channel's chat.
function recapContent(env, community, row, start, pilots) {
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
  e.id AS current_event_id, e.name AS event_name, e.departures, e.duration_hours, e.duration_minutes, e.circuit, e.schedule_pending`;

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
  const enabled = [...communities.values()].filter(item => item.modules?.crewChannels === true && item.discordGuildId && settings.has(item.id));
  const report = {opened:0, updated:0, closed:0, reminded:0, purged:0};

  const recapSettings = new Map(((await env.DB.prepare('SELECT * FROM community_recap_settings').all()).results || []).map(row => [row.community_id,row]));
  // New crews get their voice immediately, including empty crews and pending schedules.
  if (enabled.length) {
    const candidates = (await env.DB.prepare(`SELECT ${CREW_COLUMNS} FROM crews c JOIN events e ON e.id=c.event_id
      WHERE c.community_id IN (${enabled.map(() => '?').join(',')})
        AND NOT EXISTS(SELECT 1 FROM crew_discord d WHERE d.crew_id=c.id)
      ORDER BY c.created_at,c.id LIMIT 20`).bind(...enabled.map(item => item.id)).all()).results || [];
    // Record expired candidates as closed so an old backlog cannot starve new crews.
    if (candidates.length) await env.DB.batch(candidates.map(row => {
      const expiry = crewDeletionTime(row,row.departure_id);
      return env.DB.prepare('INSERT OR IGNORE INTO crew_discord(crew_id,community_id,guild_id,created_at,event_id,delete_after,closed_at) VALUES(?,?,?,?,?,?,?)')
        .bind(row.crew_id,row.community_id,communities.get(row.community_id).discordGuildId,timestamp,row.event_id,expiry,expiry !== null && timestamp >= expiry ? timestamp : null);
    }));
  }

  // Open rows, checked longest ago first. Only those with something to do on Discord are locked and worked on
  // (a run of the Worker may also make only 50 calls to the database).
  const ids = [...communities.keys()];
  if (!ids.length) return report;
  const rows = (await env.DB.prepare(`SELECT d.crew_id AS row_id, d.community_id AS row_community, d.guild_id, d.category_id, d.text_id, d.voice_id, d.message_id,
      d.recap_hash, d.members, d.starts_at, d.reminded, d.created_at, d.event_id AS row_event_id, d.delete_after, d.voice_layout_hash, ${CREW_COLUMNS}
    FROM crew_discord d LEFT JOIN crews c ON c.id=d.crew_id LEFT JOIN events e ON e.id=COALESCE(c.event_id,d.event_id)
    WHERE d.closed_at IS NULL AND d.community_id IN (${ids.map(() => '?').join(',')}) AND d.lock_until<? ORDER BY d.checked_at LIMIT 12`)
    .bind(...ids, Date.now()).all()).results || [];
  const pilots = await pilotsOf(env, rows.filter(row => row.crew_id).map(row => row.crew_id));
  const checked = [];
  for (const row of rows) {
    if (budget.left <= 0) break;
    const owner = communities.get(row.row_community), setting = settings.get(row.row_community), crewPilots = pilots.get(row.crew_id) || [];
    checked.push(row.row_id);
    if (row.current_event_id && (row.row_event_id !== row.current_event_id || row.delete_after !== crewDeletionTime(row,row.departure_id))) {
      row.delete_after = crewDeletionTime(row,row.departure_id);
      await env.DB.prepare('UPDATE crew_discord SET event_id=?,delete_after=? WHERE crew_id=?').bind(row.current_event_id,row.delete_after,row.row_id).run();
      row.row_event_id = row.current_event_id;
    }
    const recap = recapSettings.get(row.row_community);
    const layout = voiceLayout(owner,setting,recap,row);
    if (!await needsWork(env, timestamp, owner, setting, row, crewPilots, layout)) continue;
    const lock = await env.DB.prepare('UPDATE crew_discord SET lock_until=? WHERE crew_id=? AND lock_until<? AND closed_at IS NULL').bind(Date.now() + LOCK_MS, row.row_id, Date.now()).run();
    if (!lock.meta.changes) continue;
    try {
      const done = await syncRow(env, budget, timestamp, owner, setting, row, crewPilots, layout, recap);
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

  // Text channels archived by the first version, 30 days after: deleted now.
  if (budget.left > 0) {
    const old = (await env.DB.prepare(`SELECT crew_id, archived_id FROM crew_discord WHERE archived_id IS NOT NULL AND closed_at<?
      AND community_id IN (${ids.map(() => '?').join(',')}) LIMIT 3`).bind(timestamp - KEEP_ARCHIVES, ...ids).all()).results || [];
    for (const row of old) {
      try { await discord(env, budget, 'DELETE', `/channels/${row.archived_id}`); }
      catch (error) { if (error instanceof Stop) break; if (error?.status !== 404 && error?.status !== 403) continue; }
      await env.DB.prepare('UPDATE crew_discord SET archived_id=NULL WHERE crew_id=?').bind(row.crew_id).run();
      report.purged += 1;
    }
  }

  // Reminders on the bell: every pilot entered on a start beginning within 24 h (scheduled task only).
  if (bell) report.reminded += await bellReminders(env, timestamp, [...communities.values()].filter(item => item.modules?.raceReminders === true));
  return report;
}

// Reminders of the voice channel due now (the closest one is sent, the others are counted as sent).
function dueReminders(community, row, start, timestamp) {
  if (community.modules?.raceReminders !== true || start.pending || start.startsAt <= timestamp) return [];
  const reminded = Number(row.starts_at) === start.startsAt ? Number(row.reminded) || 0 : 0;
  return REMINDERS.filter(item => !(reminded & item.bit) && start.startsAt - timestamp <= item.before);
}

// Whether a row has anything to do on Discord now (most of them have not).
function voiceLayout(community, setting, recap, row) {
  const coordinated = community?.modules?.crewChannels === true && coordinatesCourse(recap, row.guild_id, row);
  const name = coordinated ? `${game(row.circuit) === 'iracing' ? 'iRacing' : 'LMU'}-${clip(safe(row.event_name),40)}-${clip(safe(row.crew_name),50) || 'Équipage'}`
    : `${game(row.circuit) === 'iracing' ? 'iRacing' : 'LMU'}-${safe(row.crew_name) || 'Équipage'}`;
  return {name:clip(name,100),type:VOICE,parent_id:coordinated ? courseCategory(recap,row) : setting?.voice_category_id || null,
    permission_overwrites:[{id:row.guild_id,type:0,allow:PUBLIC_VOICE,deny:'0'}]};
}
function mustClose(row, timestamp) {
  // A deleted crew closes immediately; a deleted event retains its last known deadline.
  return (!row.crew_id && Boolean(row.current_event_id)) || (row.delete_after != null && timestamp >= row.delete_after);
}
async function needsWork(env, timestamp, community, setting, row, pilots, layout) {
  const start = row.crew_id && row.current_event_id ? startOf(row) : null;
  if (mustClose(row,timestamp)) return true;
  if (!start || !community) return false;
  if (community.modules?.crewChannels !== true || !setting) return false;
  if (!row.voice_id || !row.message_id || row.text_id || row.category_id || (row.starts_at == null ? null : Number(row.starts_at)) !== start.startsAt || row.voice_layout_hash !== await hash(JSON.stringify(layout))) return true;
  const current = discordIds(pilots), known = JSON.parse(row.members || '[]');
  if (current.length !== known.length || current.some(id => !known.includes(id))) return true;
  if (dueReminders(community, row, start, timestamp).length) return true;
  return row.recap_hash !== await hash(recapContent(env, community, row, start, pilots));
}

// Deletes a channel (already gone: fine).
async function remove(env, budget, channelId) {
  try { await discord(env, budget, 'DELETE', `/channels/${channelId}`); }
  catch (error) { if (error?.status !== 404) throw error; }
}

// The voice channel deleted (with its chat), then what the first version made (text channel, category). Each
// step is saved, so a run that stops halfway goes on from there.
async function closeRow(env, budget, timestamp, row) {
  if (row.voice_id) {
    await remove(env, budget, row.voice_id);
    await env.DB.prepare('UPDATE crew_discord SET voice_id=NULL WHERE crew_id=?').bind(row.row_id).run();
    row.voice_id = null;
  }
  await removeLegacy(env, budget, row);
  await env.DB.prepare('UPDATE crew_discord SET closed_at=? WHERE crew_id=?').bind(timestamp, row.row_id).run();
  return true;
}

// The text channel and category of a crew opened by the first version: deleted.
async function removeLegacy(env, budget, row) {
  for (const column of ['text_id', 'category_id']) {
    if (!row[column]) continue;
    await remove(env, budget, row[column]);
    await env.DB.prepare(`UPDATE crew_discord SET ${column}=NULL WHERE crew_id=?`).bind(row.row_id).run();
    row[column] = null;
  }
}

// A message in the voice channel's chat. A channel or recap message deleted by someone on Discord is made again
// at the next check.
async function sendInChannel(env, budget, row, method, path, body) {
  try { return await discord(env, budget, method, path, body); }
  catch (error) {
    if (error?.code !== 10003 && error?.code !== 10008) throw error;
    await env.DB.prepare(`UPDATE crew_discord SET ${error.code === 10003 ? 'voice_id=NULL, ' : ''}message_id=NULL WHERE crew_id=?`).bind(row.row_id).run();
    throw new Stop('gone');
  }
}

// The crew's voice channel, in the category chosen by the admins. That category deleted on Discord: the choice
// is forgotten (the admins are told) and the channel is made at the top of the server next time.
async function createVoice(env, budget, row, setting, body) {
  const parent = body.parent_id;
  try { return await discord(env, budget, 'POST', `/guilds/${row.guild_id}/channels`, body); }
  catch (error) {
    if (!parent || (error?.status !== 400 && error?.status !== 404) || parent !== setting.voice_category_id) throw error;
    await env.DB.prepare('UPDATE community_crew_discord SET voice_category_id=NULL, last_error=?, last_error_at=? WHERE community_id=?')
      .bind('La catégorie choisie pour les vocaux n’existe plus : ils arrivent en haut du serveur.', Math.floor(Date.now() / 1000), row.row_community).run();
    setting.voice_category_id = null;
    throw new Stop('gone');
  }
}

// The categories of the server, in Discord's order (for the admins' choice), or null when Discord does not answer.
export async function serverCategories(env, guildId) {
  if (!guildId || !String(env.DISCORD_BOT_TOKEN || '').trim()) return null;
  try {
    const channels = await discord(env, {left:1}, 'GET', `/guilds/${guildId}/channels`);
    return (Array.isArray(channels) ? channels : []).filter(item => item?.type === CATEGORY)
      .sort((a, b) => (a.position || 0) - (b.position || 0)).map(item => ({id:String(item.id), name:String(item.name || '')}));
  } catch (error) {
    if (!(error instanceof Stop)) console.error('Server categories failed', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

async function syncRow(env, budget, timestamp, community, setting, row, pilots, layout, recap) {
  // Another run may have finished between the initial snapshot and acquisition of this lock.
  const current = await env.DB.prepare(`SELECT voice_id,message_id,recap_hash,members,starts_at,reminded,
    text_id,category_id,voice_layout_hash,delete_after FROM crew_discord WHERE crew_id=? AND closed_at IS NULL`).bind(row.row_id).first();
  if (!current) return null;
  Object.assign(row,current);
  // Recheck this crew’s departure deadline after taking the crew lock.
  const event = row.row_event_id && await env.DB.prepare('SELECT departures,duration_hours,duration_minutes,schedule_pending FROM events WHERE id=?').bind(row.row_event_id).first();
  if (event) {
    Object.assign(row,event);
    const expiry = crewDeletionTime(row,row.departure_id);
    if (row.delete_after !== expiry) await env.DB.prepare('UPDATE crew_discord SET delete_after=? WHERE crew_id=?').bind(expiry,row.row_id).run();
    row.delete_after = expiry;
  }
  if (mustClose(row,timestamp)) return await closeRow(env,budget,timestamp,row) ? 'closed' : null;
  const start = row.crew_id && row.current_event_id ? startOf(row) : null;
  if (!start || !community || community.modules?.crewChannels !== true || !setting) return null;
  if (community.discordGuildId !== row.guild_id) throw new Error('Le serveur Discord a changé : les anciens vocaux doivent être fermés avant de les transférer.');
  if (coordinatesCourse(recap,row.guild_id,row)) {
    let publication = await env.DB.prepare('SELECT * FROM discord_recap_publications WHERE community_id=? AND event_id=?').bind(community.id,row.event_id).first();
    if (!publication?.channel_id || publication.category_id !== layout.parent_id) {
      await syncBotRecaps(env,timestamp,community,false,{eventId:row.event_id,budget});
      publication = await env.DB.prepare('SELECT * FROM discord_recap_publications WHERE community_id=? AND event_id=?').bind(community.id,row.event_id).first();
    }
    if (!publication?.channel_id || publication.closed_at || publication.category_id !== layout.parent_id) throw new Stop('recap-pending');
  }

  const memberIds = discordIds(pilots);
  let opened = false;
  if (row.text_id || row.category_id) {
    // Opened by the first version: its text channel and category go, the recap is sent again in the voice chat.
    await removeLegacy(env, budget, row);
    Object.assign(row, {message_id:null});
    await env.DB.prepare('UPDATE crew_discord SET message_id=NULL WHERE crew_id=?').bind(row.row_id).run();
  }
  if (!row.voice_id) {
    const voice = await createVoice(env, budget, row, setting, layout);
    Object.assign(row, {voice_id:voice.id, message_id:null});
    await env.DB.prepare('UPDATE crew_discord SET voice_id=?, message_id=NULL WHERE crew_id=?').bind(voice.id, row.row_id).run();
    await env.DB.prepare('UPDATE community_crew_discord SET last_error=NULL, last_error_at=NULL WHERE community_id=?').bind(community.id).run();
    opened = true;
  }
  const layoutHash = await hash(JSON.stringify(layout));
  if (!opened && row.voice_layout_hash !== layoutHash) {
    const {type, ...changes} = layout; // Discord only allows type conversion between text and announcement channels.
    await sendInChannel(env,budget,row,'PATCH',`/channels/${row.voice_id}`,changes);
  }
  if (row.voice_layout_hash !== layoutHash) await env.DB.prepare('UPDATE crew_discord SET voice_layout_hash=? WHERE crew_id=?').bind(layoutHash,row.row_id).run();
  const content = recapContent(env, community, row, start, pilots);
  const contentHash = await hash(content);
  if (!row.message_id) {
    // Mentioned in the first message: Discord tells the pilots.
    const message = await sendInChannel(env, budget, row, 'POST', `/channels/${row.voice_id}/messages`, {content, allowed_mentions:{users:memberIds}});
    Object.assign(row, {message_id:message.id, recap_hash:contentHash, members:JSON.stringify(memberIds)});
    await env.DB.prepare('UPDATE crew_discord SET message_id=?, recap_hash=?, members=? WHERE crew_id=?').bind(message.id, contentHash, row.members, row.row_id).run();
  } else {
    if (row.recap_hash !== contentHash) {
      await sendInChannel(env, budget, row, 'PATCH', `/channels/${row.voice_id}/messages/${row.message_id}`, {content, allowed_mentions:{parse:[]}});
      await env.DB.prepare('UPDATE crew_discord SET recap_hash=? WHERE crew_id=?').bind(contentHash, row.row_id).run();
    }
    // New pilots: welcomed in the voice channel's chat.
    const before = JSON.parse(row.members || '[]'), known = new Set(before), joined = memberIds.filter(id => !known.has(id));
    if (joined.length) await sendInChannel(env, budget, row, 'POST', `/channels/${row.voice_id}/messages`,
      {content:`👋 Bienvenue ${joined.map(id => `<@${id}>`).join(', ')} dans l’équipage **${safe(row.crew_name)}** !`, allowed_mentions:{users:joined}});
    if (joined.length || memberIds.length !== before.length) await env.DB.prepare('UPDATE crew_discord SET members=? WHERE crew_id=?').bind(JSON.stringify(memberIds), row.row_id).run();
  }

  // Reminders (a moved start counts them again).
  if ((row.starts_at == null ? null : Number(row.starts_at)) !== start.startsAt) {
    Object.assign(row, {starts_at:start.startsAt, reminded:0});
    await env.DB.prepare('UPDATE crew_discord SET starts_at=?, reminded=0 WHERE crew_id=?').bind(start.startsAt, row.row_id).run();
  }
  const due = dueReminders(community, row, start, timestamp);
  if (due.length) {
    let reminded = Number(row.reminded) || 0;
    // Only the closest one is sent (a crew opened 30 min before its start gets the « 1 h » one alone).
    const last = due[due.length - 1], unix = Math.floor(start.startsAt / 1000);
    const who = memberIds.map(id => `<@${id}>`).join(' ');
    const content = last.before <= HOUR
      ? `⏰ ${who} Départ <t:${unix}:R> ! On se retrouve ici.`
      : `⏰ ${who} Rappel : **${safe(row.event_name)}**, départ <t:${unix}:F> (<t:${unix}:R>).`;
    await sendInChannel(env, budget, row, 'POST', `/channels/${row.voice_id}/messages`, {content:content.replace(/ {2,}/g, ' '), allowed_mentions:{users:memberIds}});
    for (const item of due) reminded |= item.bit;
    await env.DB.prepare('UPDATE crew_discord SET reminded=? WHERE crew_id=?').bind(reminded, row.row_id).run();
  }
  return opened ? 'opened' : 'updated';
}

// The bell, 24 h before a start: every pilot entered there in the community, with their crew and its voice channel.
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
    const entries = (await env.DB.prepare(`SELECT DISTINCT p.user_id, c.id AS crew_id, c.name AS crew_name, d.voice_id, d.guild_id FROM registrations r
        JOIN participants p ON p.id=r.participant_id
        LEFT JOIN crew_members cm ON cm.registration_id=r.id LEFT JOIN crews c ON c.id=cm.crew_id
        LEFT JOIN crew_discord d ON d.crew_id=c.id AND d.closed_at IS NULL AND d.voice_id IS NOT NULL
      WHERE r.event_id=? AND r.departure_id=? AND r.community_id=? AND p.user_id IS NOT NULL AND r.status!='unavailable'`)
      .bind(start.id, start.departure_id, start.community_id).all()).results || [];
    // One notification per crew (its name and voice channel), one for the pilots without a crew.
    const groups = new Map();
    for (const entry of entries) {
      const key = entry.crew_id || '';
      if (!groups.has(key)) groups.set(key, {entry, users:[]});
      groups.get(key).users.push(entry.user_id);
    }
    const event = {id:start.id, name:start.name, circuit:start.circuit, community_id:start.event_community};
    const departure = {startsAt:Number(start.starts_at), tbd:false};
    for (const {entry, users} of groups.values()) {
      const data = entry.crew_id ? {crewName:entry.crew_name, ...(entry.voice_id ? {channelUrl:`https://discord.com/channels/${entry.guild_id}/${entry.voice_id}`} : {})} : {};
      told += await notify(env, users.map(user_id => ({user_id, community_id:start.community_id})), 'race_reminder', event, {departure, ...data});
    }
  }
  return told;
}

// Whether the bot may make the crews' channels on the server: true, false, or null when it cannot tell (bot not
// on the server, Discord not answering).
export async function botCanManageChannels(env, guildId) {
  return (await checkBot(env, guildId)).ready;
}

// The same, with why it cannot (shown to the admins): 'rights' (rights not given yet), 'absent' (the bot is not on
// the server), 'config' (the site has no bot), 'discord' (Discord did not answer).
export async function checkBot(env, guildId) {
  if (!guildId || !env.DISCORD_CLIENT_ID || !String(env.DISCORD_BOT_TOKEN || '').trim()) return {ready:null, why:'config'};
  try {
    const budget = {left:2};
    const [member, roles] = await Promise.all([discord(env, budget, 'GET', `/guilds/${guildId}/members/${env.DISCORD_CLIENT_ID}`),
      discord(env, budget, 'GET', `/guilds/${guildId}/roles`)]);
    const mine = new Set([String(guildId), ...(member?.roles || []).map(String)]);
    const rights = (Array.isArray(roles) ? roles : []).filter(role => mine.has(String(role.id))).reduce((all, role) => all | BigInt(role.permissions || '0'), 0n);
    const ready = (rights & ADMINISTRATOR) === ADMINISTRATOR || (rights & NEEDED) === NEEDED;
    return {ready, why:ready ? null : 'rights'};
  } catch (error) {
    if (!(error instanceof Stop)) console.error('Bot rights failed', error instanceof Error ? error.message : 'unknown');
    // Not a member of the server (Unknown Member, Missing Access) or a bad token: the bot is not there for the site.
    if ([10004, 10007, 50001].includes(error?.code) || error?.status === 401) return {ready:null, why:'absent'};
    return {ready:null, why:'discord'};
  }
}
