import {pause,retryAfter,spaceOut} from './recap-discord.mjs';
import {effectivePermissions,guildPermissions,missingVoicePermissions,withPublicVoiceAccess,PUBLIC_VOICE_ACCESS,VOICE_ACCESS,EMBED} from './discord-permissions.mjs';
// Crews on Discord (migrations 0044, 0045). Two modules, each enabled by the admins of a community:
// - crewChannels (« Salons d'équipage »): from the Monday of its race's week (at once if made during that week), every crew gets a voice
//   channel named after its sim and its name (« LMU-Les Tondeuz »), made in the category the admins chose
//   (none: at the top of the server). When the recap gives each race its category (« 🏎️ LMU · 6h de Spa »), the
//   voice channel goes there, named after the crew alone, and is moved there once if it was made before. A recap message in the voice channel's chat follows the crew
//   (race, time, car, pilots), edited without a ping when a pilot joins. 2 h after the planned end the voice channel
//   is deleted with its chat, once no pilot of the crew is in it. A crew deleted before is closed at once.
//   (The first version made a category with a text channel and archived it: what is left of it is deleted too.)
// - raceReminders (« Rappels de course »): 24 h and 1 h before the start, a silent message in the crew's voice channel
//   that names its pilots without mentions; 24 h before, a notification on the site's bell for every pilot entered on the start.
// Everything is done by the bot (DISCORD_BOT_TOKEN) through Discord's REST API, by the scheduled task and right
// after a change on a crew, a few requests at a time (a run of the Worker may make 50).
import {allCommunities, communityById, communityUrl} from './community.mjs';
import {notify} from './notifications.mjs';
import {durationLabel,raceFinishAt} from '../shared/duration.mjs';
import {catalogForGame} from '../shared/catalog.mjs';
import {conditionFields, raceWeekOpen, startTimeLabel, clockLabel} from './discord-weekly-format.mjs';

const DISCORD_API = 'https://discord.com/api/v10';
const HOUR = 3600_000;
// The recap makes the race's category first: a crew's voice channel waits for it (made there directly), at
// most this long, then is made in the admins' category (and moved later).
const WAIT_CATEGORY = HOUR;
export const CLOSE_AFTER = 2 * HOUR;
const LOCK_MS = 60_000;
// Text channels archived by the first version: deleted 30 days after their race.
export const KEEP_ARCHIVES = 30 * 24 * HOUR;
export const REMINDERS = [{bit:1, before:24 * HOUR}, {bit:2, before:HOUR}];
// What the bot needs on the server for the crews (invite link of the « Modules » settings): view channels,
// manage channels, connect to voice channels, send messages, read the history.
const ADMINISTRATOR = 1n << 3n, NEEDED = VOICE_ACCESS;
// One invite for the whole « Discord » setting: the voices, the bot's own categories and messages (embeds), and making
// its categories private or open again (« Gérer les rôles »: Discord asks it to change a channel's rights), the races'
// threads (make, write in, delete).
export const CREW_BOT_PERMISSIONS = String(NEEDED | PUBLIC_VOICE_ACCESS | EMBED | (1n << 17n) | (1n << 28n) | (1n << 34n) | (1n << 35n) | (1n << 38n));
// Changing this version also repairs existing channels on their next sync.
const VOICE_POLICY_VERSION = 'public-voice-v3:';
const VOICE = 2, CATEGORY = 4;

class Stop extends Error {}

// One request to Discord as the bot. `budget.left` requests may still be made in this run; a rate limit stops it.
async function discord(env, budget, method, path, body) {
  if (budget.left <= 0) throw new Stop('budget');
  budget.left -= 1;
  const call = () => fetch(`${DISCORD_API}${path}`, {method, signal:AbortSignal.timeout(8000),
    headers:{Authorization:`Bot ${String(env.DISCORD_BOT_TOKEN || '').trim()}`, ...(body ? {'Content-Type':'application/json'} : {})},
    body:body ? JSON.stringify(body) : undefined});
  let response = await call();
  const wait = await retryAfter(response);
  if (wait !== null) response = await (await pause(wait), call());
  if (response.status === 429) { budget.left = 0; throw new Stop('rate-limited'); }
  await spaceOut(response);
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Discord ${response.status}${data?.code ? ` (${data.code})` : ''}`);
    error.status = response.status; error.code = data?.code; error.method = method; error.path = path; error.errors = data?.errors;
    throw error;
  }
  return data;
}

// What an admin can do when the bot is refused.
function errorText(error) {
  if (error?.status === 403) {
    const channelId = error.path?.match(/^\/channels\/(\d+)/)?.[1];
    const action = error.method === 'DELETE' ? 'la suppression du salon'
      : error.path?.includes('/messages') ? 'le message dans le vocal'
      : error.method === 'PATCH' ? 'la modification du salon' : 'la création du salon';
    return `Discord refuse ${action}${channelId ? ` (salon ${channelId})` : ''} : vérifie les droits du bot dans ce salon et sa catégorie, notamment « Voir le salon », « Gérer les salons », « Gérer les rôles » pour modifier les permissions, et « Se connecter ».`;
  }
  if (error?.status === 400) return `Discord a refusé les réglages du salon (code ${error.code || 'inconnu'}). Vérifie les permissions du bot et de la catégorie ; le bot réessaiera automatiquement.`;
  return 'Discord n’a pas répondu : le bot réessaiera tout seul.';
}

const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const clip = (value, size) => { const text = String(value || '').trim(); return text.length > size ? `${text.slice(0, size - 1)}…` : text; };
const game = circuit => String(circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';
// No mention or link can be slipped in through a name chosen on the site.
const safe = value => String(value || '').replace(/[@#<>*_~`|\\[\]]/g, '').replace(/\s+/g, ' ').trim();
// In a message's text a « # » stays (« Les Tondeuz #12 »): without « < », it can't make a link to a channel.
const safeText = value => String(value || '').replace(/[@<>*_~`|\\[\]]/g, '').replace(/\s+/g, ' ').trim();

// The start of the crew and when its race ends, or null (start gone, or its time not known yet).
function startOf(row) {
  const departure = parse(row.departures, []).find(item => item?.id === row.departure_id);
  const startsAt = Number(departure?.startsAt);
  if (!departure || !Number.isFinite(startsAt)) return null;
  const minutes = Number(row.duration_minutes) || (Number(row.duration_hours) || 0) * 60;
  return {startsAt, endsAt:raceFinishAt(startsAt, minutes), minutes, pending:Boolean(row.schedule_pending) || departure.tbd === true};
}

// The card of the voice channel's chat: the race, the crew and its conditions, a button to the race on the site.
// A voice's chat is narrow (Nathan, 2026-11-01): one column, a fact per line, no side picture; times in Paris words
// (« Dim. 1 nov. · 13h00 »), as everywhere; Discord's own dates only for « dans 2 heures ».
const COLORS = {lmu:0xe5484d, iracing:0x3b82f6};
const raceLink = (env, community, row) => { try { return `${communityUrl(env, community)}/${game(row.circuit)}/#event=${row.event_id}`; } catch { return ''; } };
const relative = timestamp => `<t:${Math.floor(timestamp / 1000)}:R>`;
const pageButton = link => link ? [{type:1, components:[{type:2, style:5, label:'Page de la course', emoji:{name:'📋'}, url:link}]}] : [];
const weatherOf = row => conditionFields(parse(row.event_details, {}) || {}).find(field => field.name.startsWith('🌦️'))?.value.replace(/\n/g, ' · ') || '';
function recapPayload(env, community, row, start, pilots) {
  const sim = game(row.circuit), link = raceLink(env, community, row);
  const circuit = catalogForGame(sim).circuits?.find(item => item.id === row.circuit)?.name;
  // The one who made the crew first, then the others in their order of entry.
  const ordered = [...pilots].sort((a, b) => (b.user_id && b.user_id === row.owner_user_id) - (a.user_id && a.user_id === row.owner_user_id));
  const names = ordered.map(pilot => safeText(pilot.name) && `${safeText(pilot.name)}${pilot.user_id && pilot.user_id === row.owner_user_id ? ' · responsable' : ''}`).filter(Boolean);
  const weather = weatherOf(row);
  const lines = [
    `Équipage **${safeText(row.crew_name)}** · ${row.locked ? '🔒 Complet' : '🔓 Il reste de la place'}`,
    '',
    `🟢 **${startTimeLabel(start.startsAt, start.pending)}**`,
    start.minutes && `⏱️ ${durationLabel(start.minutes)}${start.pending ? '' : ` · arrivée ${clockLabel(start.endsAt)}`}`,
    `🚗 ${[safeText(row.car) || 'Voiture à choisir', safeText(row.category)].filter(Boolean).join(' · ')}`,
    weather && `🌦️ ${weather}`,
    '',
    `👥 **Pilotes · ${names.length}**`,
    ...(names.length ? names : ['Personne pour l’instant'])
  ].filter(line => line !== false && line !== null && line !== undefined && line !== 0);
  const embed = {color:COLORS[sim],
    author:{name:[`${sim === 'iracing' ? '🏁 iRacing' : '🏎️ LMU'}`, circuit].filter(Boolean).join(' · ')},
    title:clip(safeText(row.event_name) || 'Endurance', 256), ...(link ? {url:link} : {}),
    description:clip(lines.join('\n'), 4096), footer:{text:'Ce vocal ferme 2 h après l’arrivée'}};
  return {content:'', embeds:[embed], components:pageButton(link)};
}
// After the finish, once: a word to the crew before its voice closes.
function endPayload(env, community, row, start, pilots) {
  let site = '';
  try { site = communityUrl(env, community); } catch {}
  const names = pilots.map(pilot => safeText(pilot.name)).filter(Boolean);
  return {content:'', embeds:[{color:0x23a55a, title:clip(`🏁 Course terminée, bien joué ${safeText(row.crew_name) || 'l’équipage'} !`, 256),
    description:clip([names.length && `👥 ${names.join(' · ')}`, `🔊 Ce vocal ferme ${relative(start.endsAt + CLOSE_AFTER)}`].filter(Boolean).join('\n'), 4096)}],
    components:site ? [{type:1, components:[{type:2, style:5, label:'Prochaines endurances', emoji:{name:'📅'}, url:`${site}/${game(row.circuit)}/`}]}] : []};
}
// 24 h and 1 h before the start: a card in the voice's chat, naming its pilots without mentions.
function reminderPayload(env, community, row, start, pilots, soon) {
  const names = pilots.map(pilot => safeText(pilot.name)).filter(Boolean), link = raceLink(env, community, row);
  if (soon) return {content:'', embeds:[{color:0x23a55a, description:clip(`🟢 **Départ ${relative(start.startsAt)}, on se retrouve ici.**\n${[...names, `arrivée vers ${clockLabel(start.endsAt)}`].join(' · ')}`, 4096)}]};
  const weather = weatherOf(row);
  return {content:'', embeds:[{color:COLORS[game(row.circuit)], title:clip(`⏰ Rappel · ${safeText(row.event_name) || 'Endurance'}`, 256),
    description:clip([`🟢 **${startTimeLabel(start.startsAt, start.pending)}** · ${relative(start.startsAt)}`, weather && `🌦️ ${weather}`, names.length && `👥 ${names.join(' · ')}`].filter(Boolean).join('\n'), 4096)}],
    components:pageButton(link)};
}
const END_BIT = 4;
const endDue = (row, start, timestamp) => !start.pending && timestamp >= start.endsAt && timestamp < start.endsAt + CLOSE_AFTER
  && !((Number(row.starts_at) === start.startsAt ? Number(row.reminded) || 0 : 0) & END_BIT);

async function hash(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
const discordIds = pilots => [...new Set(pilots.map(pilot => pilot.user_id).filter(id => /^\d{15,22}$/.test(id || '')))];

// The crews with their race (rows of crew_discord, or crews about to get one).
const CREW_COLUMNS = `c.id AS crew_id, c.community_id, c.name AS crew_name, c.car, c.category, c.departure_id, c.event_id, c.locked, c.owner_user_id,
  e.name AS event_name, e.details AS event_details, e.departures, e.duration_hours, e.duration_minutes, e.circuit, e.schedule_pending`;
const TRACKED_CREWS = `SELECT d.crew_id AS row_id, d.community_id AS row_community, d.guild_id, d.category_id, d.text_id, d.voice_id, d.message_id,
  d.recap_hash, d.members, d.starts_at, d.reminded, d.created_at, d.parent_id, ${CREW_COLUMNS},
  -- A race's category only counts while « Une catégorie par course » is on: otherwise the voices leave it before it goes.
  -- « Un fil par course » (the setting asked question by question) has none: the voices go just below the threads.
  s.layout AS recap_layout, CASE WHEN s.enabled=1 THEN s.bot_categories END AS recap_cats,
  CASE WHEN s.enabled=1 AND s.mode='events' AND COALESCE(s.layout,'')='' AND p.category_id NOT IN (COALESCE(s.destination_id,''),COALESCE(s.iracing_destination_id,'')) THEN p.category_id END AS race_category,
  CASE WHEN s.enabled=1 AND s.mode='events' AND COALESCE(s.layout,'')='' THEN CASE WHEN s.destination_id<>'' AND s.iracing_destination_id<>'' THEN 'all'
    WHEN s.destination_id<>'' THEN 'lmu' WHEN s.iracing_destination_id<>'' THEN 'iracing' END END AS race_scope
  FROM crew_discord d LEFT JOIN crews c ON c.id=d.crew_id LEFT JOIN events e ON e.id=c.event_id
    LEFT JOIN discord_recap_publications p ON p.community_id=d.community_id AND p.event_id=c.event_id AND p.closed_at IS NULL
    LEFT JOIN community_recap_settings s ON s.community_id=d.community_id`;

async function pilotsOf(env, crewIds) {
  const byCrew = new Map(crewIds.map(crewId => [crewId, []]));
  if (!crewIds.length) return byCrew;
  const rows = (await env.DB.prepare(`SELECT cm.crew_id, p.user_id, COALESCE(NULLIF(m.nickname,''), p.name, r.name) AS name FROM crew_members cm
    JOIN registrations r ON r.id=cm.registration_id JOIN participants p ON p.id=r.participant_id
    LEFT JOIN memberships m ON m.user_id=p.user_id AND m.community_id=r.community_id AND m.status='member'
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

  // New crews: a row for each crew (even before a pilot joins), its start time known and still to come, from the
  // Monday of the week of its start (a crew made during that week gets its voice at once).
  if (enabled.length) {
    const candidates = (await env.DB.prepare(`SELECT ${CREW_COLUMNS} FROM crews c JOIN events e ON e.id=c.event_id
      WHERE c.community_id IN (${enabled.map(() => '?').join(',')}) AND e.schedule_pending=0
        AND NOT EXISTS(SELECT 1 FROM crew_discord d WHERE d.crew_id=c.id)
        AND EXISTS(SELECT 1 FROM json_each(e.departures) j WHERE json_extract(j.value,'$.id')=c.departure_id
          AND COALESCE(json_extract(j.value,'$.tbd'),0)=0 AND json_extract(j.value,'$.startsAt') > ? AND json_extract(j.value,'$.startsAt') <= ?)
      LIMIT 20`).bind(...enabled.map(item => item.id), timestamp - 2 * 24 * HOUR, timestamp + 8 * 24 * HOUR).all()).results || [];
    const fresh = candidates.filter(row => { const start = startOf(row); return start && !start.pending && timestamp < start.endsAt && raceWeekOpen(start.startsAt, timestamp); });
    if (fresh.length) await env.DB.batch(fresh.map(row => env.DB.prepare('INSERT OR IGNORE INTO crew_discord(crew_id,community_id,guild_id,created_at) VALUES(?,?,?,?)')
      .bind(row.crew_id, row.community_id, communities.get(row.community_id).discordGuildId, timestamp)));
  }

  // Open rows, checked longest ago first. Only those with something to do on Discord are locked and worked on
  // (a run of the Worker may also make only 50 calls to the database).
  const ids = [...communities.keys()];
  if (!ids.length) return report;
  // Older deployments marked failed deletions closed. Recover them even when the repair
  // migration has not run: a closed row must never retain active channel ids.
  await env.DB.prepare(`UPDATE crew_discord SET closed_at=NULL, lock_until=0, checked_at=0
    WHERE closed_at IS NOT NULL AND (voice_id IS NOT NULL OR text_id IS NOT NULL OR category_id IS NOT NULL)
      AND community_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
  const rows = (await env.DB.prepare(`${TRACKED_CREWS}
    WHERE d.closed_at IS NULL AND d.community_id IN (${ids.map(() => '?').join(',')}) AND d.lock_until<?
    ORDER BY c.id IS NOT NULL, d.checked_at LIMIT 40`)
    .bind(...ids, timestamp).all()).results || [];
  const pilots = await pilotsOf(env, rows.filter(row => row.crew_id).map(row => row.crew_id));
  const checked = [], failed = new Set(), succeeded = new Set();
  for (const row of rows) {
    if (budget.left <= 0) break;
    const owner = communities.get(row.row_community), setting = settings.get(row.row_community), crewPilots = pilots.get(row.crew_id) || [];
    checked.push(row.row_id);
    if (!await needsWork(env, timestamp, owner, setting, row, crewPilots)) continue;
    const lock = await env.DB.prepare('UPDATE crew_discord SET lock_until=? WHERE crew_id=? AND lock_until<? AND closed_at IS NULL').bind(timestamp + LOCK_MS, row.row_id, timestamp).run();
    if (!lock.meta.changes) continue;
    try {
      // Another sync may have created the channel since the initial read, or the crew may be gone.
      // Read again under the lock so an outdated snapshot cannot create an untracked duplicate.
      const current = await env.DB.prepare(`${TRACKED_CREWS} WHERE d.crew_id=? AND d.closed_at IS NULL`).bind(row.row_id).first();
      if (!current) continue;
      const done = await syncRow(env, budget, timestamp, owner, setting, current, crewPilots);
      if (done) { report[done] += 1; succeeded.add(row.row_community); }
    } catch (error) {
      if (!(error instanceof Stop)) {
        failed.add(row.row_community);
        console.error('Crew Discord sync failed', owner?.slug, error instanceof Error ? error.message : 'unknown', error.method || '', error.path || '');
        if ([400,403,404].includes(error?.status)) await env.DB.prepare('UPDATE community_crew_discord SET last_error=?, last_error_at=? WHERE community_id=?')
          .bind(errorText(error), Math.floor(timestamp / 1000), row.row_community).run().catch(() => {});
      }
    } finally {
      await env.DB.prepare('UPDATE crew_discord SET lock_until=0 WHERE crew_id=?').bind(row.row_id).run().catch(() => {});
    }
  }
  // A successful retry must not leave a historical warning displayed forever. Do not
  // clear a refusal encountered elsewhere in this same pass or a more recent sync.
  for (const communityId of succeeded) if (!failed.has(communityId)) {
    await env.DB.prepare('UPDATE community_crew_discord SET last_error=NULL,last_error_at=NULL WHERE community_id=? AND last_error_at<=?')
      .bind(communityId,Math.floor(timestamp / 1000)).run();
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

// Where a crew's voice goes: its race's category, else, in « Un fil par course » with the sims apart, its sim's category of
// the bot (« LMU » or « iRacing »), else the category chosen for the voices.
function voiceParent(row, setting) {
  if (row.race_category) return row.race_category;
  try {
    const layout = JSON.parse(row.recap_layout || 'null'), cats = JSON.parse(row.recap_cats || 'null');
    if (layout?.mode === 'events' && layout.split && cats?.[game(row.circuit)]) return cats[game(row.circuit)];
  } catch { /* an unreadable setting: the voices' category */ }
  return setting.voice_category_id || null;
}
// Whether a row has anything to do on Discord now (most of them have not).
async function needsWork(env, timestamp, community, setting, row, pilots) {
  const start = row.crew_id && row.event_name ? startOf(row) : null;
  if (!start || !community || timestamp >= start.endsAt + CLOSE_AFTER) return true;
  // Voices turned off (or everything taken off): the voice channel goes.
  if (community.modules?.crewChannels !== true || !setting) return Boolean(row.voice_id);
  if (!row.voice_id || !row.message_id || row.text_id || row.category_id || Number(row.starts_at) !== start.startsAt) return true;
  if ((row.parent_id || null) !== voiceParent(row, setting)) return true;
  const current = discordIds(pilots), known = JSON.parse(row.members || '[]');
  if (current.length !== known.length || current.some(id => !known.includes(id))) return true;
  if (dueReminders(community, row, start, timestamp).length || endDue(row, start, timestamp)) return true;
  return row.recap_hash !== VOICE_POLICY_VERSION + await hash(JSON.stringify(recapPayload(env, community, row, start, pilots)));
}

// Deletes a channel (already gone: fine).
async function remove(env, budget, channelId) {
  try { await discord(env, budget, 'DELETE', `/channels/${channelId}`); }
  catch (error) { if (error?.status !== 404) throw error; }
}

// Recover duplicates whose ids were overwritten by overlapping syncs in older versions.
// Only inspect the categories the site puts voices in (race categories, the voices' category of « pit talk », the
// bot's « LMU » / « iRacing »), and require the bot's own original recap of a race of this community.
export async function cleanupOrphanCrewDiscord(env, timestamp = Date.now()) {
  if (!env?.DB || !env.DISCORD_BOT_TOKEN || !env.DISCORD_CLIENT_ID) return 0;
  // A Worker deployment does not necessarily apply D1 migrations. Recovery also works
  // on the previous schema, using the cron slot to rotate without the optional cursors.
  const settings = (await env.DB.prepare(`SELECT s.* FROM community_crew_discord s JOIN communities c ON c.id=s.community_id
    WHERE c.discord_guild_id IS NOT NULL AND (s.voice_category_id IS NOT NULL OR EXISTS(SELECT 1 FROM discord_recap_publications p
      WHERE p.community_id=s.community_id AND p.category_id IS NOT NULL AND p.event_id<>''))
    ORDER BY s.community_id`).all()).results || [];
  if (!settings.length) return 0;
  const slot = Math.floor(timestamp / (15 * 60_000));
  const persistentCursor = Object.hasOwn(settings[0], 'orphan_checked_at');
  const setting = persistentCursor
    ? settings.sort((a,b) => a.orphan_checked_at - b.orphan_checked_at)[0]
    : settings[slot % settings.length];
  if (persistentCursor) await env.DB.prepare('UPDATE community_crew_discord SET orphan_checked_at=? WHERE community_id=?').bind(timestamp,setting.community_id).run();
  const community = await communityById(env,setting.community_id);
  const budget = {left:3};
  const publications = (await env.DB.prepare(`SELECT event_id,category_id FROM discord_recap_publications
    WHERE community_id=? AND category_id IS NOT NULL AND event_id<>''`).bind(community.id).all()).results || [];
  const races = new Map(publications.map(row => [row.category_id,row.event_id]));
  // Categories holding the voices of several races: the race is read from the recap's link.
  const shared = new Set([setting.voice_category_id].filter(Boolean));
  const recap = await env.DB.prepare('SELECT enabled,bot_categories FROM community_recap_settings WHERE community_id=?').bind(community.id).first().catch(() => null);
  if (recap?.enabled) { try { for (const id of Object.values(JSON.parse(recap.bot_categories || '{}') || {})) if (typeof id === 'string') shared.add(id); } catch { /* unreadable: ignored */ } }
  const tracked = (await env.DB.prepare('SELECT voice_id FROM crew_discord WHERE guild_id=? AND voice_id IS NOT NULL')
    .bind(community.discordGuildId).all()).results || [];
  const known = new Set(tracked.map(row => row.voice_id));
  const channels = await discord(env,budget,'GET',`/guilds/${community.discordGuildId}/channels`);
  const candidates = (Array.isArray(channels) ? channels : []).filter(channel => channel.type === VOICE
    && (races.has(channel.parent_id) || shared.has(channel.parent_id)) && !known.has(channel.id) && /^\d{15,22}$/.test(channel.id)
    && Number((BigInt(channel.id) >> 22n) + 1420070400000n) < timestamp - 5 * 60_000)
    .sort((a,b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
  const channel = persistentCursor
    ? candidates.find(item => !setting.orphan_cursor || BigInt(item.id) > BigInt(setting.orphan_cursor)) || candidates[0]
    : candidates[Math.floor(slot / settings.length) % candidates.length];
  if (!channel) return 0;
  try {
    const messages = await discord(env,budget,'GET',`/channels/${channel.id}/messages?after=0&limit=100`);
    const ours = (Array.isArray(messages) ? messages : []).filter(message => message.author?.bot === true && message.author.id === env.DISCORD_CLIENT_ID);
    const base = communityUrl(env,community), linked = text => String(text || '').match(/#event=([\w-]+)$/)?.[1];
    const eventId = races.get(channel.parent_id) || ours.map(message => linked(message.embeds?.[0]?.url)
      || String(message.content || '').split('\n').map(line => line.startsWith('🔗 Inscriptions et équipage : ') ? linked(line) : null).find(Boolean)).find(Boolean);
    if (!eventId) return 0;
    const links = ['lmu','iracing'].map(sim => `${base}/${sim}/#event=${eventId}`);
    // The text recap of before, or the card (its title links to the race).
    const card = ours.find(message => (links.some(link => String(message.content || '').split('\n').includes(`🔗 Inscriptions et équipage : ${link}`))
        || links.includes(message.embeds?.[0]?.url)));
    const name = (card?.content?.match(/^👥 Équipage \*\*([^\n]+)\*\* : /m) || card?.embeds?.[0]?.description?.match(/^Équipage \*\*([^\n]+)\*\* · /))?.[1];
    // In a race's category the voice is named after its crew; elsewhere after its sim, race and crew.
    if (!name || (channel.name !== clip(name,100) && !(/^(🏎️ LMU|🏁 iRacing) · /u.test(channel.name) && channel.name.endsWith(` · ${name}`)))) return 0;
    // Re-read immediately before deletion: a creation still in flight or another live crew is protected.
    if (await env.DB.prepare('SELECT 1 FROM crew_discord WHERE guild_id=? AND voice_id=?')
      .bind(community.discordGuildId,channel.id).first()) return 0;
    const crews = (await env.DB.prepare('SELECT name FROM crews WHERE community_id=? AND event_id=?')
      .bind(community.id,eventId).all()).results || [];
    if (crews.some(crew => safe(crew.name) === name)) return 0;
    await remove(env,budget,channel.id);
    return 1;
  } finally {
    if (persistentCursor) await env.DB.prepare('UPDATE community_crew_discord SET orphan_cursor=? WHERE community_id=?')
      .bind(channel.id,community.id).run();
  }
}

// A successful crew deletion must not wait behind recap updates or other crews.
// Keep the tracking row on failure so the scheduled sync can retry the cleanup.
export async function closeDeletedCrewDiscord(env, crewId, timestamp = Date.now()) {
  if (!env?.DB || !String(env.DISCORD_BOT_TOKEN || '').trim()) return;
  const lock = await env.DB.prepare(`UPDATE crew_discord SET lock_until=?
    WHERE crew_id=? AND closed_at IS NULL AND lock_until<?
      AND NOT EXISTS(SELECT 1 FROM crews WHERE id=?)`)
    .bind(timestamp + LOCK_MS, crewId, timestamp, crewId).run();
  if (!lock.meta.changes) return;
  try {
    const row = await env.DB.prepare('SELECT *, crew_id AS row_id FROM crew_discord WHERE crew_id=?').bind(crewId).first();
    await closeRow(env, {left:3}, timestamp, row, [], {force:true});
    await env.DB.prepare('UPDATE community_crew_discord SET last_error=NULL,last_error_at=NULL WHERE community_id=? AND last_error_at<=?')
      .bind(row.community_id,Math.floor(timestamp / 1000)).run();
  } catch (error) {
    await env.DB.prepare(`UPDATE community_crew_discord SET last_error=?, last_error_at=?
      WHERE community_id=(SELECT community_id FROM crew_discord WHERE crew_id=?)`)
      .bind(errorText(error), Math.floor(timestamp / 1000), crewId).run().catch(() => {});
    throw error;
  } finally {
    await env.DB.prepare('UPDATE crew_discord SET lock_until=0 WHERE crew_id=?').bind(crewId).run();
  }
}

// The voice channel deleted (with its chat), then what the first version made (text channel, category). Each
// step is saved, so a run that stops halfway goes on from there.
async function closeRow(env, budget, timestamp, row, members, {force = false, keepOpen = false} = {}) {
  if (row.voice_id) {
    // A pilot of the crew still talking in the voice channel: it stays until the next check.
    if (!force) for (const userId of members) {
      try {
        const state = await discord(env, budget, 'GET', `/guilds/${row.guild_id}/voice-states/${userId}`);
        if (state?.channel_id === row.voice_id) return false;
      } catch (error) {
        // Only a confirmed absence proves this pilot is not in the voice channel.
        // A permission refusal or an outage must never disconnect an occupied crew.
        if (error instanceof Stop || error?.status !== 404 || ![10065,10007].includes(error?.code)) throw error;
      }
    }
    await remove(env, budget, row.voice_id);
    await env.DB.prepare(`UPDATE crew_discord SET voice_id=NULL${keepOpen ? ', message_id=NULL, parent_id=NULL' : ''} WHERE crew_id=?`).bind(row.row_id).run();
    row.voice_id = null;
  }
  if (keepOpen) return true;
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

// The crew's voice channel, in its race's category when the recap made one (« 🏎️ LMU · 6h de Spa »), otherwise
// in the category chosen by the admins. That category deleted on Discord: the choice is forgotten (the admins are
// told) and the channel is made at the top of the server next time.
// The race's category deleted on Discord: forgotten, the recap makes it again (server/recap-discord.mjs raceThread) and
// the voice goes there on the next pass.
async function raceCategoryGone(env, row) {
  await env.DB.prepare('UPDATE discord_recap_publications SET category_id=NULL WHERE community_id=? AND event_id=? AND category_id=?').bind(row.row_community, row.event_id, row.race_category).run();
  await env.DB.prepare('UPDATE community_recap_settings SET dirty=1 WHERE community_id=?').bind(row.row_community).run();
  throw new Stop('gone');
}
async function createVoice(env, budget, row, setting, body) {
  const parent = voiceParent(row, setting);
  try {
    const category = parent ? await discord(env,budget,'GET',`/channels/${parent}`) : null;
    const create = rules => discord(env,budget,'POST',`/guilds/${row.guild_id}/channels`,{...body,...(parent ? {parent_id:parent} : {}),...rules});
    // If copied permissions are refused, retry with only public voice and bot access.
    return await create({permission_overwrites:withPublicVoiceAccess(category?.permission_overwrites,row.guild_id,env.DISCORD_CLIENT_ID)})
      .catch(error => { if (parent && error?.code === 50013) return create({permission_overwrites:withPublicVoiceAccess([],row.guild_id,env.DISCORD_CLIENT_ID)}); throw error; });
  } catch (error) {
    const parentGone = error?.status === 404 && error?.code === 10003 || error?.status === 400 && error?.errors?.parent_id;
    if (row.race_category && parentGone) await raceCategoryGone(env, row);
    if (row.race_category || !parent || !parentGone) throw error;
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

// The recap gives each race of this sim its category (« Une catégorie par course ») but has not made this one yet.
const waitsForCategory = (row, timestamp) => !row.race_category && timestamp - Number(row.created_at) < WAIT_CATEGORY
  && (row.race_scope === 'all' || row.race_scope === game(row.circuit));

// In its race's category the crew's name is enough; elsewhere the sim and the race come first (« LMU · 6h de Spa · Équipage A »).
// « 🏎️ LMU · 6h de Spa · Équipage A »: the race's logo in front, as its thread.
export const crewVoiceName = row => clip(`${game(row.circuit) === 'iracing' ? '🏁 iRacing' : '🏎️ LMU'} · ${safe(row.event_name) || 'Endurance'} · ${safe(row.crew_name) || 'Équipage'}`, 100);
const voiceName = (row, crewName) => clip(row.race_category ? crewName : crewVoiceName({...row, crew_name:crewName}), 100);
// In the admins' category the voice channels follow the races: LMU first, then iRacing, each by start (one request).
async function sortVoices(env, budget, row, parent) {
  const rows = (await env.DB.prepare(`SELECT d.voice_id, d.created_at, c.departure_id, e.circuit, e.departures FROM crew_discord d
    JOIN crews c ON c.id=d.crew_id JOIN events e ON e.id=c.event_id
    WHERE d.community_id=? AND d.closed_at IS NULL AND d.voice_id IS NOT NULL AND d.parent_id=?`).bind(row.row_community, parent).all()).results || [];
  if (rows.length < 2) return;
  const startOfRow = item => Number((JSON.parse(item.departures || '[]').find(start => start?.id === item.departure_id) || {}).startsAt) || Infinity;
  const key = item => [game(item.circuit) === 'iracing' ? 1 : 0, startOfRow(item), Number(item.created_at) || 0];
  rows.sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
  await discord(env, budget, 'PATCH', `/guilds/${row.guild_id}/channels`, rows.map((item, position) => ({id:item.voice_id, position})));
}

async function syncRow(env, budget, timestamp, community, setting, row, pilots) {
  const start = row.crew_id && row.event_name ? startOf(row) : null;
  const members = JSON.parse(row.members || '[]');
  // Crew, race or start gone: closed now; 2 h after the planned end: closed once the voice channel is empty.
  if (!start || !community || timestamp >= start.endsAt + CLOSE_AFTER) {
    // A failed DELETE is still pending, regardless of the age of the crew or race.
    return await closeRow(env, budget, timestamp, row, members, {force:!start || !community}) ? 'closed' : null;
  }
  // Voices turned off: the voice channel goes once nobody of the crew talks in it; the row stays open, so the voice comes
  // back if the admins turn them on again before the race.
  // Voices turned off, or the race's sim not shown on Discord (« LMU » only: no voice for an iRacing race).
  const sims = (() => { try { return JSON.parse(row.recap_layout || 'null')?.sims; } catch { return null; } })();
  if (community.modules?.crewChannels !== true || !setting || (sims && sims !== 'all' && sims !== game(row.circuit))) {
    if (!row.voice_id) return null;
    const removed = await closeRow(env, budget, timestamp, {...row, text_id:null, category_id:null}, members, {keepOpen:true});
    return removed ? 'closed' : null;
  }

  const current = discordIds(pilots);
  const crewName = safe(row.crew_name) || 'Équipage';
  let opened = false;
  if (row.text_id || row.category_id) {
    // Opened by the first version: its text channel and category go, the recap is sent again in the voice chat.
    await removeLegacy(env, budget, row);
    Object.assign(row, {message_id:null});
    await env.DB.prepare('UPDATE crew_discord SET message_id=NULL WHERE crew_id=?').bind(row.row_id).run();
  }
  if (!row.voice_id && waitsForCategory(row, timestamp)) return null;
  if (!row.voice_id) {
    const voice = await createVoice(env, budget, row, setting, {name:voiceName(row, crewName), type:VOICE});
    Object.assign(row, {voice_id:voice.id, message_id:null, parent_id:voice.parent_id || null});
    await env.DB.prepare('UPDATE crew_discord SET voice_id=?, message_id=NULL, parent_id=? WHERE crew_id=?').bind(voice.id, row.parent_id, row.row_id).run();
    if (!row.race_category && row.parent_id) await sortVoices(env, budget, row, row.parent_id);
    opened = true;
  }
  const parent = voiceParent(row, setting);
  if (!opened && (row.parent_id || null) !== parent) {
    // Opened elsewhere (before its race's category, or before the admins chose where the voices go): moved there once,
    // and named for that place.
    let target = {permission_overwrites:[]};
    if (parent) try { target = await discord(env,budget,'GET',`/channels/${parent}`); }
    catch (error) {
      if (row.race_category && error?.status === 404) await raceCategoryGone(env, row);
      if (error instanceof Stop || row.race_category || error?.status !== 404) throw error;
      await env.DB.prepare('UPDATE community_crew_discord SET voice_category_id=NULL, last_error=?, last_error_at=? WHERE community_id=?')
        .bind('La catégorie choisie pour les vocaux n’existe plus : ils arrivent en haut du serveur.', Math.floor(Date.now() / 1000), row.row_community).run();
      setting.voice_category_id = null;
      throw new Stop('gone');
    }
    // Deleted on Discord: made again on the next pass.
    const voice = await sendInChannel(env,budget,row,'GET',`/channels/${row.voice_id}`);
    // Preserve existing channel rules where available; apply public voice access below.
    const hasMemberRules = (voice.permission_overwrites || []).some(item => !(String(item.id) === String(env.DISCORD_CLIENT_ID) && Number(item.type) === 1));
    const rules = hasMemberRules ? voice.permission_overwrites : target.permission_overwrites;
    await sendInChannel(env, budget, row, 'PATCH', `/channels/${row.voice_id}`, {parent_id:parent, name:voiceName(row, crewName),
      permission_overwrites:withPublicVoiceAccess(rules,row.guild_id,env.DISCORD_CLIENT_ID)});
    row.parent_id = parent;
    await env.DB.prepare('UPDATE crew_discord SET parent_id=? WHERE crew_id=?').bind(row.parent_id, row.row_id).run();
    if (!row.race_category && parent) await sortVoices(env, budget, row, parent);
  }
  // Repair existing vocals once after a voice policy upgrade, preserving unrelated restrictions.
  if (!opened && !row.recap_hash?.startsWith(VOICE_POLICY_VERSION) && (row.parent_id || null) === parent) {
    const voice = await sendInChannel(env,budget,row,'GET',`/channels/${row.voice_id}`);
    const rules = withPublicVoiceAccess(voice.permission_overwrites,row.guild_id,env.DISCORD_CLIENT_ID);
    if (JSON.stringify(rules) !== JSON.stringify(voice.permission_overwrites || [])) {
      await sendInChannel(env,budget,row,'PATCH',`/channels/${row.voice_id}`,{permission_overwrites:rules});
    }
  }
  const payload = recapPayload(env, community, row, start, pilots);
  const contentHash = VOICE_POLICY_VERSION + await hash(JSON.stringify(payload));
  if (!row.message_id) {
    // Plain names only: even the first message must not notify or ping the pilots.
    const message = await sendInChannel(env, budget, row, 'POST', `/channels/${row.voice_id}/messages`, {...payload, allowed_mentions:{parse:[]}, flags:4096});
    Object.assign(row, {message_id:message.id, recap_hash:contentHash, members:JSON.stringify(current)});
    await env.DB.prepare('UPDATE crew_discord SET message_id=?, recap_hash=?, members=? WHERE crew_id=?').bind(message.id, contentHash, row.members, row.row_id).run();
  } else {
    if (row.recap_hash !== contentHash) {
      await sendInChannel(env, budget, row, 'PATCH', `/channels/${row.voice_id}/messages/${row.message_id}`, {...payload, allowed_mentions:{parse:[]}});
      // The crew may have been renamed: its voice follows (read first, Discord allows few renames per channel).
      const wanted = voiceName(row, crewName), voice = await sendInChannel(env, budget, row, 'GET', `/channels/${row.voice_id}`);
      if (voice?.name && voice.name !== wanted) await sendInChannel(env, budget, row, 'PATCH', `/channels/${row.voice_id}`, {name:wanted});
      await env.DB.prepare('UPDATE crew_discord SET recap_hash=? WHERE crew_id=?').bind(contentHash, row.row_id).run();
    }
    // A pilot who joins gets no message: the edited recap is enough.
    if (row.members !== JSON.stringify(current)) await env.DB.prepare('UPDATE crew_discord SET members=? WHERE crew_id=?').bind(JSON.stringify(current), row.row_id).run();
  }

  // Reminders (a moved start counts them again).
  if (Number(row.starts_at) !== start.startsAt) {
    Object.assign(row, {starts_at:start.startsAt, reminded:0});
    await env.DB.prepare('UPDATE crew_discord SET starts_at=?, reminded=0 WHERE crew_id=?').bind(start.startsAt, row.row_id).run();
  }
  const due = dueReminders(community, row, start, timestamp);
  if (due.length) {
    let reminded = Number(row.reminded) || 0;
    // Only the closest one is sent (a crew opened 30 min before its start gets the « 1 h » one alone).
    const last = due[due.length - 1];
    await sendInChannel(env, budget, row, 'POST', `/channels/${row.voice_id}/messages`, {...reminderPayload(env, community, row, start, pilots, last.before <= HOUR), allowed_mentions:{parse:[]}, flags:4096});
    for (const item of due) reminded |= item.bit;
    await env.DB.prepare('UPDATE crew_discord SET reminded=? WHERE crew_id=?').bind(reminded, row.row_id).run();
    row.reminded = reminded;
  }
  if (endDue(row, start, timestamp)) {
    await sendInChannel(env, budget, row, 'POST', `/channels/${row.voice_id}/messages`, {...endPayload(env, community, row, start, pilots), allowed_mentions:{parse:[]}, flags:4096});
    row.reminded = (Number(row.reminded) || 0) | END_BIT;
    await env.DB.prepare('UPDATE crew_discord SET reminded=? WHERE crew_id=?').bind(row.reminded, row.row_id).run();
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
// required: channels that must exist (the category an admin just chose); the others may be gone, the bot makes them again.
export async function checkBot(env, guildId, {channelIds = [], required = [], includeCategories = false} = {}) {
  if (!guildId || !env.DISCORD_CLIENT_ID || !String(env.DISCORD_BOT_TOKEN || '').trim()) return {ready:null, why:'config'};
  try {
    const budget = {left:3};
    const [member, roles, channels] = await Promise.all([discord(env, budget, 'GET', `/guilds/${guildId}/members/${env.DISCORD_CLIENT_ID}`),
      discord(env, budget, 'GET', `/guilds/${guildId}/roles`),
      channelIds.length || includeCategories ? discord(env,budget,'GET',`/guilds/${guildId}/channels`) : []]);
    if (!member || !Array.isArray(roles) || !Array.isArray(channels)) throw new Error('Réponse Discord invalide.');
    const rights = guildPermissions(roles,member,guildId);
    const ready = (rights & ADMINISTRATOR) === ADMINISTRATOR || (rights & NEEDED) === NEEDED;
    const missing = ready ? [] : missingVoicePermissions(rights);
    const categories = channels.filter(item => item.type === CATEGORY).sort((a,b) => (a.position || 0) - (b.position || 0))
      .map(item => ({id:String(item.id),name:String(item.name || '')}));
    if (!ready) return {ready:false,why:'rights',missing,categories};
    for (const channelId of [...new Set(channelIds.filter(Boolean))]) {
      const channel = channels.find(item => String(item.id) === String(channelId));
      if (!channel && !required.includes(channelId)) continue;
      const missing = channel ? missingVoicePermissions(effectivePermissions(roles,member,guildId,channel,env.DISCORD_CLIENT_ID)) : ['Voir le salon'];
      if (missing.length) return {ready:false,why:'channel',missing,channelId,channelName:channel?.name || channelId,categories};
    }
    return {ready:true,why:null,missing:[],categories};
  } catch (error) {
    if (!(error instanceof Stop)) console.error('Bot rights failed', error instanceof Error ? error.message : 'unknown');
    // Not a member of the server (Unknown Member, Missing Access) or a bad token: the bot is not there for the site.
    if ([10004, 10007, 50001].includes(error?.code) || error?.status === 401) return {ready:null, why:'absent'};
    return {ready:null, why:'discord'};
  }
}


// layout: the setting asked question by question is being saved: the bot makes its own categories (with its rights, from
// those it has on the server), so only a category of the admins chosen for the voices is checked, not the places of before.
export async function checkCrewAccess(env, community, {categoryId, includeCategories = false, failedChannelId = null, layout = false} = {}) {
  if (layout) return checkBot(env,community.discordGuildId,{channelIds:categoryId ? [String(categoryId)] : [],required:categoryId ? [String(categoryId)] : [],includeCategories});
  const recap = await env.DB.prepare('SELECT enabled,mode,destination_id,iracing_destination_id FROM community_recap_settings WHERE community_id=?').bind(community.id).first();
  const saved = categoryId === undefined ? await env.DB.prepare('SELECT voice_category_id FROM community_crew_discord WHERE community_id=?').bind(community.id).first() : null;
  const destinations = recap?.enabled && recap.mode === 'events' ? [recap.destination_id, recap.iracing_destination_id] : [categoryId ?? saved?.voice_category_id];
  const tracked = (await env.DB.prepare(`SELECT category_id AS id FROM discord_recap_publications WHERE community_id=? AND closed_at IS NULL AND category_id IS NOT NULL
    UNION SELECT voice_id AS id FROM crew_discord WHERE community_id=? AND closed_at IS NULL AND voice_id IS NOT NULL`).bind(community.id,community.id).all()).results || [];
  // A week message's key is « destination#salon »: the destination is what the bot needs to reach.
  const ids = [...destinations,...tracked.map(row => String(row.id).split('#')[0]),failedChannelId].filter(Boolean);
  return checkBot(env,community.discordGuildId,{channelIds:ids,required:categoryId ? [String(categoryId)] : [],includeCategories});
}
export async function validateCrewAccess(env,community,options = {}) {
  const result = await checkCrewAccess(env,community,options);
  if (result.ready !== true) {
    const message = result.why === 'channel'
      ? `Dans les permissions de « ${result.channelName} », un administrateur Discord doit autoriser Endurance Manager : ${result.missing.join(', ')}. Les autres accès restent privés.`
      : result.missing?.length ? `Droits manquants pour le bot : ${result.missing.join(', ')}. Clique sur « Donner les droits au bot ».`
      : 'Impossible de vérifier les droits du bot. Vérifie sa présence sur le serveur, puis réessaie.';
    throw Object.assign(new Error(message),{status:400});
  }
  return result;
}
