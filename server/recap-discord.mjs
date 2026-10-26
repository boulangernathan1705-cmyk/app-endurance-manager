import {effectivePermissions,withBotAccess,VOICE_ACCESS} from './discord-permissions.mjs';
import {iracingSoloSql} from './iracing-visibility.mjs';
// Text recaps configured explicitly by an admin, published exclusively by the bot.
import {loadWeeklyDiscordSnapshot, loadCalendarSnapshot, siteOf} from './discord-weekly.mjs';
import {buildWeeklyDiscordPayload, buildCalendarPayload, CATEGORY_EMOJI_NAMES} from './discord-weekly-format.mjs';
import {tdzOnly} from '../shared/catalog.mjs';
import {isDevelopment} from './dev-environment.mjs';

const API = 'https://discord.com/api/v10', DAY = 86400000;
// Layout of the recap message: raised when it changes, so the published recaps are edited once.
const RECAP_FORMAT = 7;
const MAX_CHANNELS = 450;
const RACE_INFO_CHANNEL = 'infos-de-la-course'; // Discord writes text channel names in lowercase with dashes
const VIEW = 1024n, SEND = 2048n, HISTORY = 65536n, EMBED = 16384n, MANAGE = 16n, ADMIN = 8n;
const REQUIRED = VIEW | SEND | HISTORY | EMBED;
export const RECAP_BOT_PERMISSIONS = String(REQUIRED | MANAGE);
export const botRecapSettings = (env, community) => env.DB.prepare('SELECT * FROM community_recap_settings WHERE community_id=?').bind(community.id).first();
// Each recap has its own place (migration 0079): destination_id for the LMU races, iracing_destination_id for the iRacing
// ones (a category in « une catégorie par course », a text channel in « récap de la semaine »), calendar_destination_id for
// the week's events. '' = not published. The week's messages are publications « week:lmu », « week:iracing », « week:calendar ».
const WEEK = {lmu:'week:lmu', iracing:'week:iracing', calendar:'week:calendar'};
const isRaceRow = row => Boolean(row?.event_id) && !String(row.event_id).startsWith('week:');
const isIracing = event => String(event?.circuit || '').startsWith('iracing-');
// The category a race goes under; none in « récap de la semaine ».
const anchorOf = (settings, event) => settings.mode !== 'events' ? '' : (isIracing(event) ? settings.iracing_destination_id : settings.destination_id) || '';
// The admins' categories and channels: never deleted.
const anchorIds = settings => [settings.destination_id, settings.iracing_destination_id, settings.calendar_destination_id].filter(Boolean);
// The races that get a category: 'all', 'lmu', 'iracing', or null.
export const scopeOf = settings => settings.mode !== 'events' ? null : settings.destination_id && settings.iracing_destination_id ? 'all'
  : settings.destination_id ? 'lmu' : settings.iracing_destination_id ? 'iracing' : null;
function weekDestination(settings, kind, community) {
  if (kind === 'calendar') return community.modules?.soloRaces === true ? settings.calendar_destination_id || '' : '';
  return settings.mode === 'general' ? (kind === 'iracing' ? settings.iracing_destination_id : settings.destination_id) || '' : '';
}
// Several messages in one channel keep the order they were sent in: the TDZ calendar comes first.
const messageOrder = (env, community) => tdzOnly(community, isDevelopment(env)) ? ['calendar','lmu','iracing'] : ['lmu','iracing','calendar'];
const MESSAGE_NAMES = {lmu:'Endurances LMU', iracing:'Endurances iRacing', calendar:'Calendrier de la semaine'};
// In the category chosen for a week's recap, the bot makes its own text channel (with its rights): the endurances share one.
export const WEEK_CHANNELS = {races:'récap-de-la-semaine', calendar:'calendrier-de-la-semaine'};
const weekGroup = kind => kind === 'calendar' ? 'calendar' : 'races';
const parse = value => { try { const result = JSON.parse(value); return Array.isArray(result) ? result : []; } catch { return []; } };

export function recapError(error) {
  if (error.status === 429) return 'Discord limite les requêtes. Le récap réessaiera automatiquement.';
  if (error.status === 403) return 'Dans les permissions du salon ou de la catégorie, autorise le bot à Voir le salon, Envoyer des messages, Intégrer des liens et Voir les anciens messages ; en mode par événement, ajoute Gérer les salons.';
  if (error.status === 404) {
    if (error.code === 10008 || (!error.code && /\/messages\/[^/?]+$/.test(error.path || ''))) return 'Le message de récap a été supprimé sur Discord. Clique sur Réparer le récap pour le republier dans le salon existant.';
    if (error.code === 10004) return 'Le serveur Discord est introuvable pour le bot. Vérifie le serveur lié à cette communauté et la présence du bot.';
    if (error.path?.startsWith('/channels/')) return 'Le salon de publication du récap est introuvable ou inaccessible au bot. Clique sur Réparer le récap pour rétablir les salons de course disparus. Si la destination choisie a disparu, utilise Modifier pour en choisir une autre.';
    return 'La catégorie ou le salon de destination est introuvable. Clique sur Modifier, actualise les destinations et sélectionne une destination existante.';
  }
  if (error.status === 400) return `Discord a refusé le récap (code ${error.code || 'inconnu'}). Vérifie les permissions du bot et signale cette erreur au gestionnaire.`;
  if (error.status === 401) return 'Le bot du site n’est pas disponible. Préviens le gestionnaire de la plateforme.';
  return 'Discord ne répond pas. Le récap réessaiera automatiquement.';
}
async function discord(env, method, path, body, budget = {left:12}) {
  if (!String(env.DISCORD_BOT_TOKEN || '').trim()) throw Object.assign(new Error('Le bot du site n’est pas configuré.'), {status:401});
  if (--budget.left < 0) throw new Error('Lot terminé ; les autres événements seront traités au prochain passage.');
  const response = await fetch(API + path, {method, signal:AbortSignal.timeout(8000),
    headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`, ...(body ? {'Content-Type':'application/json'} : {})}, body:body ? JSON.stringify(body) : undefined});
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error('Discord indisponible'), {status:response.status, code:data?.code, path});
  return data;
}
export async function recapDestinations(env, community) {
  if (!community.discordGuildId || !env.DISCORD_CLIENT_ID) throw Object.assign(new Error('Relie le serveur de la communauté au bot.'), {status:401});
  const guild = community.discordGuildId;
  const [channels, roles, member] = await Promise.all([
    discord(env, 'GET', `/guilds/${guild}/channels`), discord(env, 'GET', `/guilds/${guild}/roles`),
    discord(env, 'GET', `/guilds/${guild}/members/${env.DISCORD_CLIENT_ID}`)]);
  if (!Array.isArray(channels) || !Array.isArray(roles) || !member) throw new Error('Réponse Discord invalide.');
  return channels.filter(channel => [0,4].includes(channel.type)).map(channel => {
    const rights = effectivePermissions(roles, member, guild, channel, env.DISCORD_CLIENT_ID);
    const voiceRequired = channel.type === 4 && community.modules?.crewChannels === true;
    const required = REQUIRED | (channel.type === 4 ? MANAGE : 0n) | (voiceRequired ? VOICE_ACCESS : 0n);
    return {id:channel.id, name:channel.name, type:channel.type, ready:(rights & required) === required,
      missing:[['Voir le salon',VIEW],['Envoyer des messages',SEND],['Voir les anciens messages',HISTORY],['Intégrer des liens',EMBED], ...(channel.type === 4 ? [['Gérer les salons',MANAGE]] : []),...(voiceRequired ? [['Se connecter',1n << 20n]] : [])].filter(([,bit]) => !(rights & bit)).map(([label]) => label)};
  });
}
// The admins' choice: the mode, then where each recap goes (an id, or '' for « Ne pas publier »).
export function recapInput(input) {
  const id = value => {
    const text = String(value ?? '').trim();
    if (text && !/^\d{15,22}$/.test(text)) throw Object.assign(new Error('Choisis une destination sur le serveur Discord de cette communauté.'), {status:400});
    return text;
  };
  if (!['general','events'].includes(input?.mode)) throw Object.assign(new Error('Choisis comment ranger les courses.'), {status:400});
  return {mode:input.mode, lmu:id(input.lmuId), iracing:id(input.iracingId), calendar:id(input.calendarId)};
}
// The settings row of a choice (names as on Discord).
export function settingsRow(mode, lmu = {}, iracing = {}, calendar = {}) {
  return {mode, scope:lmu.id && iracing.id ? 'all' : iracing.id ? 'iracing' : 'lmu',
    destination_id:lmu.id || '', destination_name:lmu.name || '', iracing_destination_id:iracing.id || '', iracing_destination_name:iracing.name || '',
    calendar_destination_id:calendar.id || '', calendar_destination_name:calendar.name || ''};
}
// The races go under categories (« une catégorie par course ») or in text channels (« récap de la semaine »), the calendar in a
// text channel; the bot must have its rights there.
export async function validateRecapDestinations(env, community, input) {
  const wanted = recapInput(input);
  const calendar = community.modules?.soloRaces === true ? wanted.calendar : '';
  if (!wanted.lmu && !wanted.iracing && !calendar) throw Object.assign(new Error('Choisis au moins un endroit où publier.'), {status:400});
  const destinations = await recapDestinations(env, community);
  const pick = (id, type) => {
    if (!id) return {};
    const destination = destinations.find(item => item.id === id && item.type === type);
    if (!destination) throw Object.assign(new Error('Choisis une destination sur le serveur Discord de cette communauté.'), {status:400});
    if (!destination.ready) throw Object.assign(new Error(`Dans les permissions de « ${destination.name} », autorise le bot : ${destination.missing.join(', ')}.`), {status:400});
    return {id, name:destination.name};
  };
  // A week's recap goes in a category (the bot makes its channel there); a text channel chosen before still works.
  const week = id => destinations.find(item => item.id === id)?.type === 0 ? pick(id, 0) : pick(id, 4);
  const races = id => wanted.mode === 'events' ? pick(id, 4) : week(id);
  return settingsRow(wanted.mode, races(wanted.lmu), races(wanted.iracing), week(calendar));
}
export function eventChannelName(name, eventId) {
  const slug = String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'endurance';
  // A stable short suffix makes homonymous races readable. The topic stores the complete identity.
  let hash = 2166136261;
  for (const char of String(eventId)) hash = Math.imul(hash ^ char.charCodeAt(0),16777619);
  const suffix = (hash >>> 0).toString(16).padStart(8,'0');
  return `${slug.slice(0, Math.max(1, 99 - suffix.length))}-${suffix}`.slice(0,100);
}
export function eventDeletionTime(event) {
  const departures = parse(event?.departures);
  if (!departures.length || event?.schedule_pending || departures.some(item => item.tbd || !Number.isFinite(Number(item.startsAt)))) return null;
  const minutes = Number(event.duration_minutes) || Number(event.duration_hours) * 60;
  if (!(minutes > 0)) return null;
  return Math.max(...departures.map(item => Number(item.startsAt))) + minutes * 60000 + DAY;
}
// The races that get their category now: 7 days before a start (15 for a 24 h race) until they are over.
export const openBefore = minutes => (minutes >= 1440 ? 15 : 7) * DAY;
export function racesOpenNow(events, scope, timestamp) {
  return events.filter(event => {
    const iracing = isIracing(event);
    if ((scope === 'lmu' && iracing) || (scope === 'iracing' && !iracing) || event.schedule_pending) return false;
    const minutes = Number(event.duration_minutes) || Number(event.duration_hours) * 60 || 0;
    return parse(event.departures).some(item => !item.tbd && Number(item.startsAt) + minutes * 60000 > timestamp && Number(item.startsAt) - openBefore(minutes) <= timestamp);
  }).map(event => event.id);
}
// The endurances (the calendar's events have their own message).
const raceEvents = (env, community) => env.DB.prepare(`SELECT id,name,circuit,departures,duration_hours,duration_minutes,schedule_pending,community_id FROM events WHERE (community_id=? OR community_id='official') AND COALESCE(format,'endurance')<>'solo' AND ${iracingSoloSql(env,community)} ORDER BY created_at,id`)
  .bind(community.id).all().then(result => result.results || []);
// The races where this community has an entry, an absence or a crew.
async function enteredRaces(env, community) {
  const rows = (await env.DB.prepare(`SELECT event_id FROM crews WHERE community_id=?
    UNION SELECT event_id FROM registrations WHERE community_id=? UNION SELECT event_id FROM event_absences WHERE community_id=?`)
    .bind(community.id,community.id,community.id).all()).results || [];
  return new Set(rows.map(row => row.event_id));
}
// The races that get a recap now, even without any entry: it invites the pilots to sign up. The official iRacing
// races are imported by the dozen (server/iracing-import.mjs): only those where the community has something.
async function openRaces(env, community, events, scope, timestamp) {
  const entered = await enteredRaces(env, community);
  return racesOpenNow(events.filter(event => event.community_id !== 'official' || !String(event.circuit || '').startsWith('iracing-') || entered.has(event.id)), scope, timestamp);
}
export const raceCategoryName = event =>
  `${String(event?.circuit || '').startsWith('iracing-') ? '🏁 iRacing' : '🏎️ LMU'} · ${String(event?.name || 'Endurance').trim()}`.slice(0,100);
// The race categories follow the category chosen for their sim: LMU first, then iRacing, each by date of its first start
// (one request reorders them all).
async function placeCategory(env, community, guildId, channels, category, settings, budget) {
  const open = new Map(((await env.DB.prepare(`SELECT p.category_id,e.circuit,e.departures FROM discord_recap_publications p LEFT JOIN events e ON e.id=p.event_id
    WHERE p.community_id=? AND p.closed_at IS NULL AND p.category_id IS NOT NULL`).bind(community.id).all()).results || [])
    .map(item => [item.category_id,[String(item.circuit || '').startsWith('iracing-') ? 1 : 0,Math.min(...parse(item.departures).map(start => Number(start.startsAt)).filter(Number.isFinite))]]));
  // Existing race categories may be scattered anywhere in the server (old placements or
  // a previous reorder interrupted after creation). Gather every managed category.
  const categories = channels.filter(item => item.type === 4).sort((a,b) => (a.position || 0) - (b.position || 0) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  if (category && !categories.some(item => item.id === category)) categories.push({id:category});
  const key = item => open.get(item.id) || [2,Infinity];
  const anchors = anchorIds(settings);
  const races = categories.filter(item => !anchors.includes(item.id) && open.has(item.id))
    .sort((a,b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]);
  const remaining = categories.filter(item => !races.some(race => race.id === item.id));
  let placed = 0;
  for (const anchor of new Set(anchors)) {
    const mine = races.filter(item => (key(item)[0] === 1 ? settings.iracing_destination_id : settings.destination_id) === anchor);
    const index = remaining.findIndex(item => item.id === anchor);
    if (index < 0 || !mine.length) continue;
    remaining.splice(index + 1,0,...mine);
    placed += mine.length;
  }
  if (!placed) return;
  // The races of a sim no longer published stay together at the end.
  remaining.push(...races.filter(item => !remaining.includes(item)));
  if (remaining.every((item,index) => item.id === categories[index]?.id)) return;
  await discord(env,'PATCH',`/guilds/${guildId}/channels`,remaining.map((item,position) => ({id:item.id,position})),budget);
}
// The race's text channel, then its category (never a category chosen by the admins).
async function removeRaceChannels(env, row, anchors, budget) {
  for (const id of [row.channel_id, !anchors.includes(row.category_id) ? row.category_id : null].filter(Boolean)) {
    try { await discord(env,'DELETE',`/channels/${id}`,null,budget); }
    catch (error) { if (error.status !== 404) throw error; }
  }
}
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
// The category logos are the bot's own emojis (application emojis: usable on every server, no Nitro).
// The missing ones are uploaded once from images/discord-emojis; kept a few hours per instance.
let categoryEmojis = {at:0, ids:{}};
export async function botCategoryEmojis(env, timestamp = Date.now()) {
  if (timestamp - categoryEmojis.at < 6 * 3600000) return categoryEmojis.ids;
  const ids = {};
  try {
    const app = env.DISCORD_CLIENT_ID, budget = {left:1 + CATEGORY_EMOJI_NAMES.length};
    if (!app || !env.ASSETS) return ids;
    const list = await discord(env,'GET',`/applications/${app}/emojis`,null,budget);
    for (const emoji of list?.items || []) ids[emoji.name] = emoji.id;
    for (const name of CATEGORY_EMOJI_NAMES.filter(name => !ids[name])) {
      const file = await env.ASSETS.fetch(new Request(`${env.APP_ORIGIN || 'https://endurance-manager.app'}/images/discord-emojis/${name.slice(3)}.png`));
      if (!file.ok) continue;
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      ids[name] = (await discord(env,'POST',`/applications/${app}/emojis`,{name,image:`data:image/png;base64,${btoa(binary)}`},budget)).id;
    }
    categoryEmojis = {at:timestamp, ids};
  } catch {
    // Without them the categories keep their colour; retried half an hour later.
    categoryEmojis = {at:timestamp - 5.5 * 3600000, ids};
  }
  return ids;
}
// A race's message (eventId), or a week's message: kind 'lmu', 'iracing' or 'calendar'.
async function snapshotPayload(env, timestamp, community, eventId = null, kind = null) {
  if (kind === 'calendar') {
    const snapshot = await loadCalendarSnapshot(env, timestamp, community);
    const payload = buildCalendarPayload(snapshot, siteOf(env, community), timestamp);
    return {snapshot, payload, hash:await digest([RECAP_FORMAT,'calendar',snapshot])};
  }
  const scope = eventId ? 'all' : kind;
  const snapshot = await loadWeeklyDiscordSnapshot(env, timestamp, community, scope, eventId);
  const emojis = await botCategoryEmojis(env, timestamp);
  const payload = buildWeeklyDiscordPayload(snapshot, siteOf(env, community), timestamp, scope, emojis, {weekly:!eventId});
  // Message edits are silent; never turn driver names into mentions.
  payload.allowed_mentions = {parse:[]};
  // A new layout of the message (RECAP_FORMAT) edits the published recaps once.
  return {snapshot, payload, hash:await digest([RECAP_FORMAT,snapshot,emojis])};
}
// What the bot would publish with these settings (a settings row), without publishing anything.
export async function previewBotRecap(env, timestamp, community, settings) {
  const previews = [];
  for (const kind of messageOrder(env, community)) {
    if (!weekDestination(settings, kind, community)) continue;
    const {payload} = await snapshotPayload(env, timestamp, community, null, kind);
    const name = kind === 'calendar' ? settings.calendar_destination_name : kind === 'iracing' ? settings.iracing_destination_name : settings.destination_name;
    previews.push({eventId:WEEK[kind], name:`${name} · ${MESSAGE_NAMES[kind]}`, payload});
  }
  const scope = scopeOf(settings);
  if (!scope) return previews;
  const events = await raceEvents(env, community);
  for (const eventId of await openRaces(env, community, events, scope, timestamp)) {
    if (previews.length === 10) break;
    const {snapshot, payload} = await snapshotPayload(env, timestamp, community, eventId);
    // An official race without any entry of this community gets no category.
    if (snapshot.futureDepartures.length) previews.push({eventId,name:raceCategoryName(events.find(item => item.id === eventId)),payload});
  }
  return previews;
}
export async function saveBotRecap(env, community, settings, enabled = true, adopted = true) {
  // Configuration and synchronisation share the lock. A destination cannot change during a publication.
  const token = crypto.randomUUID(), now = Date.now();
  const current = await botRecapSettings(env, community);
  if (current && current.guild_id !== community.discordGuildId) {
    const existing = await env.DB.prepare("SELECT 1 FROM discord_recap_publications WHERE community_id=? AND event_id NOT LIKE 'week:%' AND closed_at IS NULL LIMIT 1").bind(community.id).first();
    if (existing) throw Object.assign(new Error('Les salons du serveur précédent doivent être supprimés avant de changer de serveur.'), {status:400});
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO community_recap_settings(community_id,enabled,mode,scope,guild_id,destination_id,destination_name)
    VALUES(?,0,?,?,?,?,?)`).bind(community.id,settings.mode,settings.scope,community.discordGuildId,settings.destination_id,settings.destination_name).run();
  const result = await env.DB.prepare("UPDATE community_recap_settings SET lock_token=?,lock_until=? WHERE community_id=? AND lock_until<?")
    .bind(token,now+180000,community.id,now).run();
  if (!result.meta.changes) throw Object.assign(new Error('Une synchronisation est en cours. Réessaie dans un instant.'), {status:409});
  try {
    await env.DB.prepare(`UPDATE community_recap_settings SET enabled=?,adopted=?,mode=?,scope=?,guild_id=?,destination_id=?,destination_name=?,
      iracing_destination_id=?,iracing_destination_name=?,calendar_destination_id=?,calendar_destination_name=?,revision=revision+1,last_error=NULL
      WHERE community_id=? AND lock_token=?`)
      .bind(Number(enabled),Number(adopted),settings.mode,settings.scope,community.discordGuildId,settings.destination_id,settings.destination_name,
        settings.iracing_destination_id,settings.iracing_destination_name,settings.calendar_destination_id,settings.calendar_destination_name,community.id,token).run();
  } finally {
    await env.DB.prepare("UPDATE community_recap_settings SET lock_token='',lock_until=0 WHERE community_id=? AND lock_token=?").bind(community.id,token).run();
  }
}
async function ensurePublication(env, community, eventId, settings) {
  const marker = 'endurance-manager:' + (await digest([community.id,eventId])).slice(0,24);
  await env.DB.prepare('INSERT OR IGNORE INTO discord_recap_publications(community_id,event_id,guild_id,marker) VALUES(?,?,?,?)')
    .bind(community.id,eventId,settings.guild_id,marker).run();
  return env.DB.prepare('SELECT * FROM discord_recap_publications WHERE community_id=? AND event_id=?').bind(community.id,eventId).first();
}
async function publish(env, timestamp, community, settings, row, event, budget, prepared = null, repair = false) {
  const isEvent = isRaceRow(row);
  if (isEvent) await env.DB.prepare('UPDATE discord_recap_publications SET delete_after=? WHERE community_id=? AND event_id=?').bind(eventDeletionTime(event),community.id,row.event_id).run();
  if (row.closed_at) return;
  let channel = row.channel_id;
  const kind = isEvent ? null : row.event_id.slice(5);
  if (!isEvent) {
    const destination = weekDestination(settings, kind, community);
    // Set up for this destination: the category it was made in, or the text channel chosen before.
    const placed = row.category_id ? row.category_id === destination : Boolean(channel) && channel === destination;
    let channels = null;
    if (placed && repair && row.category_id) {
      channels = await discord(env,'GET',`/guilds/${row.guild_id}/channels`,null,budget);
      if (!channels.some(item => item.id === channel)) channel = null;
    }
    if (!placed || !channel) {
      const next = await weekChannel(env, community, row, kind, destination, budget);
      if (row.channel_id !== next.channel) await takeDown(env, community, row, budget);
      channel = next.channel;
      if (row.channel_id !== channel) { row.message_id = null; row.content_hash = ''; }
      Object.assign(row, {channel_id:channel, category_id:next.category});
      await env.DB.prepare('UPDATE discord_recap_publications SET channel_id=?,category_id=?,message_id=?,content_hash=? WHERE community_id=? AND event_id=?')
        .bind(channel,next.category,row.message_id,row.content_hash,community.id,row.event_id).run();
    }
  }
  const anchors = anchorIds(settings), anchorId = isEvent ? anchorOf(settings, event) : '';
  if (isEvent && (repair || !channel || !row.category_id || anchors.includes(row.category_id))) {
    // One category per race (« 🏎️ LMU · 6h de Spa »): its recap here, the crews' voice channels below it.
    // The first version put the text channel straight in the chosen category: it is moved into its race's.
    const channels = await discord(env,'GET',`/guilds/${row.guild_id}/channels`,null,budget);
    if (repair) {
      // Only an explicit test repairs channels deleted on Discord; automatic sync never recreates them.
      if (row.category_id && !channels.some(item => item.id === row.category_id && item.type === 4)) row.category_id = null;
      if (channel && !channels.some(item => item.id === channel && item.type === 0)) {
        channel = null; row.channel_id = null; row.message_id = null; row.content_hash = '';
        await env.DB.prepare('UPDATE discord_recap_publications SET channel_id=NULL,message_id=NULL,content_hash=? WHERE community_id=? AND event_id=?')
          .bind('',community.id,row.event_id).run();
      }
    }
    let category = row.category_id && !anchors.includes(row.category_id) ? row.category_id : null;
    if (!category) {
      // Discord allows 500 channels per server: room is kept for the crews' voice channels.
      if (channels.length >= MAX_CHANNELS) return;
      const anchor = channels.find(item => item.id === anchorId && item.type === 4);
      if (!anchor) throw Object.assign(new Error('Discord indisponible'), {status:404,code:10003});
      // Categories cannot be nested: explicitly retain the chosen category's access rules.
      category = (await discord(env,'POST',`/guilds/${row.guild_id}/channels`,{type:4,name:raceCategoryName(event),permission_overwrites:withBotAccess(anchor.permission_overwrites,env.DISCORD_CLIENT_ID,REQUIRED | MANAGE | (community.modules?.crewChannels === true ? VOICE_ACCESS : 0n))},budget)).id;
      row.category_id = category;
      await env.DB.prepare('UPDATE discord_recap_publications SET category_id=? WHERE community_id=? AND event_id=?').bind(category,community.id,row.event_id).run();
      await placeCategory(env,community,row.guild_id,channels,category,settings,budget);
    }
    // Recover a channel created just before a timeout/crash from its exact topic marker, never its name.
    const existing = channel ? channels.find(item => item.id === channel) : channels.find(item => item.type === 0 && item.topic === row.marker);
    if (existing && (existing.parent_id !== category || existing.name !== RACE_INFO_CHANNEL)) await discord(env,'PATCH',`/channels/${existing.id}`,{parent_id:category,name:RACE_INFO_CHANNEL},budget);
    channel = existing?.id || channel || (await discord(env,'POST',`/guilds/${row.guild_id}/channels`,{type:0,name:RACE_INFO_CHANNEL,parent_id:category,topic:row.marker},budget)).id;
    await env.DB.prepare('UPDATE discord_recap_publications SET channel_id=? WHERE community_id=? AND event_id=?').bind(channel,community.id,row.event_id).run();
  }
  const {payload, hash} = prepared || await snapshotPayload(env,timestamp,community,isEvent ? row.event_id : null,kind);
  if (!repair && row.message_id && row.content_hash === hash) return;
  if (row.message_id) {
    // A removed message or channel is reported, not recreated on every update (no surprise notifications).
    try { await discord(env,'PATCH',`/channels/${channel}/messages/${row.message_id}`,payload,budget); }
    catch (error) {
      // Never treat missing access/channels, timeouts or ambiguous errors as a deleted message.
      if (!repair || error.status !== 404 || error.code !== 10008) throw error;
      row.message_id = null;
      await env.DB.prepare('UPDATE discord_recap_publications SET message_id=NULL,content_hash=? WHERE community_id=? AND event_id=?')
        .bind('',community.id,row.event_id).run();
    }
  }
  if (!row.message_id) {
    // Recover a first message after a lost response. No second POST on an ambiguous first send.
    const messages = await discord(env,'GET',`/channels/${channel}/messages?limit=100`,null,budget);
    const existing = messages.find(item => item.author?.id === env.DISCORD_CLIENT_ID && item.nonce === row.marker.slice(-24));
    const message = existing || await discord(env,'POST',`/channels/${channel}/messages`,
      {...payload,nonce:row.marker.slice(-24),enforce_nonce:true,flags:4096},budget);
    row.message_id = message.id;
  }
  await env.DB.prepare('UPDATE discord_recap_publications SET message_id=?,content_hash=? WHERE community_id=? AND event_id=?')
    .bind(row.message_id,hash,community.id,row.event_id).run();
}
// The week's channel in the chosen category, made by the bot with its rights and found again by its topic. A text channel
// chosen before (no category) is used as it is.
async function weekChannel(env, community, row, kind, destination, budget) {
  const channels = await discord(env,'GET',`/guilds/${row.guild_id}/channels`,null,budget);
  const target = channels.find(item => item.id === destination);
  if (!target) throw Object.assign(new Error('Discord indisponible'), {status:404,code:10003,path:`/channels/${destination}`});
  if (target.type !== 4) return {channel:target.id, category:null};
  const group = weekGroup(kind), topic = 'endurance-manager:' + (await digest([community.id,'week',destination,group])).slice(0,24);
  const existing = channels.find(item => item.type === 0 && item.topic === topic);
  if (existing) return {channel:existing.id, category:destination};
  const created = await discord(env,'POST',`/guilds/${row.guild_id}/channels`,{type:0,name:WEEK_CHANNELS[group],parent_id:destination,topic,
    permission_overwrites:withBotAccess(target.permission_overwrites,env.DISCORD_CLIENT_ID,REQUIRED)},budget);
  return {channel:created.id, category:destination};
}
// A week's message the admins no longer want (or no longer there): deleted on Discord, with the bot's channel once no recap
// uses it. Already gone: forgotten.
async function takeDown(env, community, row, budget) {
  const ignoreGone = error => { if (error.status !== 404) throw error; };
  if (row.message_id) await discord(env,'DELETE',`/channels/${row.channel_id}/messages/${row.message_id}`,null,budget).catch(ignoreGone);
  await env.DB.prepare("UPDATE discord_recap_publications SET channel_id=NULL,category_id=NULL,message_id=NULL,content_hash='' WHERE community_id=? AND event_id=?").bind(community.id,row.event_id).run();
  if (row.category_id && row.channel_id && !await env.DB.prepare("SELECT 1 FROM discord_recap_publications WHERE community_id=? AND event_id LIKE 'week:%' AND channel_id=?").bind(community.id,row.channel_id).first())
    await discord(env,'DELETE',`/channels/${row.channel_id}`,null,budget).catch(ignoreGone);
  Object.assign(row, {channel_id:null, category_id:null, message_id:null, content_hash:''});
}
async function syncLocked(env,timestamp,community,settings, test = false, budget = {left:12}, priority = null) {
  const rows = (await env.DB.prepare('SELECT * FROM discord_recap_publications WHERE community_id=? AND closed_at IS NULL ORDER BY checked_at,event_id').bind(community.id).all()).results || [];
  const events = await raceEvents(env, community);
  // Cleanup is independent of mode/activation. Only bot-created event channels may be deleted.
  for (const row of rows.filter(isRaceRow).slice(0,2)) {
    const event = events.find(item => item.id === row.event_id), deleteAt = event ? eventDeletionTime(event) : row.delete_after;
    // A race no longer given a category (« récap de la semaine », or its sim not published) loses its channels at once.
    const unwanted = settings.enabled && event && !anchorOf(settings, event);
    if (deleteAt !== null && timestamp >= deleteAt) {
      await removeRaceChannels(env,row,anchorIds(settings),budget);
      await env.DB.prepare('UPDATE discord_recap_publications SET closed_at=? WHERE community_id=? AND event_id=?').bind(timestamp,community.id,row.event_id).run();
      row.closed_at = timestamp;
    } else if (unwanted && (row.category_id || row.channel_id)) {
      // Forgotten, not closed: back to « une catégorie par course », the race gets its category again.
      await removeRaceChannels(env,row,anchorIds(settings),budget);
      await env.DB.prepare("UPDATE discord_recap_publications SET category_id=NULL,channel_id=NULL,message_id=NULL,content_hash='' WHERE community_id=? AND event_id=?").bind(community.id,row.event_id).run();
      Object.assign(row, {category_id:null, channel_id:null, message_id:null, content_hash:''});
    }
    await env.DB.prepare('UPDATE discord_recap_publications SET checked_at=? WHERE community_id=? AND event_id=?').bind(timestamp,community.id,row.event_id).run();
  }
  if (!settings.enabled && !test) return {ok:true,disabled:true};
  if (settings.guild_id !== community.discordGuildId) throw new Error('Le serveur Discord a changé. Configure à nouveau la destination.');
  // The week's messages, each in its channel; one no longer wanted is taken down.
  for (const kind of messageOrder(env, community)) {
    if (!weekDestination(settings, kind, community)) {
      const row = rows.find(item => item.event_id === WEEK[kind]);
      if (row?.message_id) await takeDown(env, community, row, budget);
      continue;
    }
    const row = await ensurePublication(env,community,WEEK[kind],settings);
    await publish(env,timestamp,community,settings,row,null,budget,null,test);
  }
  const scope = scopeOf(settings);
  if (scope) {
    const eligible = await openRaces(env,community,events,scope,timestamp);
    const ids = [...new Set([...rows.filter(row => isRaceRow(row) && !row.closed_at).map(row => row.event_id),...eligible])];
    // The race just changed first, then the ones checked longest ago.
    const ordered = ids.sort((a,b) => (b === priority) - (a === priority) || (rows.find(row => row.event_id === a)?.checked_at || 0) - (rows.find(row => row.event_id === b)?.checked_at || 0));
    // Repair scattered existing categories even when all recap messages are unchanged.
    // The normal creation path already orders newly created categories.
    if (rows.some(row => isRaceRow(row) && row.category_id && !row.closed_at)) {
      const channels = await discord(env,'GET',`/guilds/${settings.guild_id}/channels`,null,budget);
      await placeCategory(env,community,settings.guild_id,channels,null,settings,budget);
    }
    for (const eventId of ordered.filter(id => anchorOf(settings, events.find(item => item.id === id))).slice(0,2)) {
      const event = events.find(item => item.id === eventId);
      if (!event || (eventDeletionTime(event) !== null && timestamp >= eventDeletionTime(event))) continue;
      // Reuse the eligibility/isolation query even for previously published official races.
      const prepared = await snapshotPayload(env,timestamp,community,eventId);
      if (!prepared.snapshot.futureDepartures.length && !rows.some(row => row.event_id === eventId)) continue;
      const row = await ensurePublication(env,community,eventId,settings);
      await publish(env,timestamp,community,settings,row,event,budget,prepared,test);
      await env.DB.prepare('UPDATE discord_recap_publications SET checked_at=? WHERE community_id=? AND event_id=?').bind(timestamp,community.id,eventId).run();
    }
  }
  return {ok:true};
}
export async function syncBotRecaps(env,timestamp,community, test = false, priority = null) {
  const token = crypto.randomUUID(), now = Date.now();
  await env.DB.prepare('UPDATE community_recap_settings SET dirty=1 WHERE community_id=?').bind(community.id).run();
  const lock = await env.DB.prepare("UPDATE community_recap_settings SET lock_token=?,lock_until=? WHERE community_id=? AND lock_until<?")
    .bind(token,now+180000,community.id,now).run();
  if (!lock.meta.changes) return {ok:true,queued:true};
  try {
    let result;
    const budget = {left:16};
    for (let attempt=0;attempt<2;attempt++) {
      await env.DB.prepare('UPDATE community_recap_settings SET dirty=0 WHERE community_id=? AND lock_token=?').bind(community.id,token).run();
      result = await syncLocked(env,timestamp,community,await botRecapSettings(env,community),test,budget,priority);
      const current = await botRecapSettings(env,community);
      if (!current.dirty) break;
    }
    await env.DB.prepare('UPDATE community_recap_settings SET last_error=NULL WHERE community_id=? AND lock_token=?').bind(community.id,token).run();
    return result;
  } catch (error) {
    const message = error.message.startsWith('Discord') ? recapError(error) : error.message;
    await env.DB.prepare('UPDATE community_recap_settings SET last_error=?,dirty=1 WHERE community_id=? AND lock_token=?').bind(message,community.id,token).run();
    throw new Error(message);
  } finally {
    await env.DB.prepare("UPDATE community_recap_settings SET checked_at=?,lock_token='',lock_until=0 WHERE community_id=? AND lock_token=?").bind(timestamp,community.id,token).run();
  }
}
// Repair uses the saved configuration; it never switches mode, destination or activation.
export async function repairBotRecap(env,timestamp,community) {
  const current=await botRecapSettings(env,community);
  if (!current) throw Object.assign(new Error('Configure d’abord le récap dans Administration → Modules.'),{status:400});
  if (current.guild_id !== community.discordGuildId) throw Object.assign(new Error('Le serveur Discord a changé. Clique sur Modifier pour choisir la destination sur le bon serveur.'),{status:400});
  await validateRecapDestinations(env,community,{mode:current.mode,lmuId:current.destination_id,iracingId:current.iracing_destination_id,calendarId:current.calendar_destination_id});
  return syncBotRecaps(env,timestamp,community,true);
}

// Every 15 minutes, separately from the hourly recap rotation. Re-read race times before deleting.
export async function cleanupEventRecaps(env, timestamp = Date.now(), limit = 2) {
  if (!env?.DB || !env.DISCORD_BOT_TOKEN) return 0;
  const rows = (await env.DB.prepare(`SELECT p.*,s.destination_id AS anchor_id,s.iracing_destination_id AS iracing_anchor_id,e.id AS current_event_id,e.departures,e.duration_hours,e.duration_minutes,e.schedule_pending
    FROM discord_recap_publications p LEFT JOIN community_recap_settings s ON s.community_id=p.community_id LEFT JOIN events e ON e.id=p.event_id
    WHERE p.event_id NOT LIKE 'week:%' AND p.event_id<>'' AND p.closed_at IS NULL`).all()).results || [];
  const due = rows.map(row => ({...row,expiry:row.current_event_id ? eventDeletionTime(row) : row.delete_after}))
    .filter(row => row.expiry !== null && timestamp >= row.expiry).sort((a,b) => a.expiry-b.expiry);
  let deleted = 0;
  for (const row of due.slice(0,limit)) {
    const token = crypto.randomUUID(), now = Date.now();
    const lock = await env.DB.prepare('UPDATE community_recap_settings SET lock_token=?,lock_until=? WHERE community_id=? AND lock_until<?')
      .bind(token,now+180000,row.community_id,now).run();
    if (!lock.meta.changes) continue;
    try {
      // Configuration synchronisations cannot race this deletion; recheck the event after taking the lock.
      const event = await env.DB.prepare('SELECT departures,duration_hours,duration_minutes,schedule_pending FROM events WHERE id=?').bind(row.event_id).first();
      const expiry = event ? eventDeletionTime(event) : row.delete_after;
      if (expiry === null || timestamp < expiry) continue;
      await removeRaceChannels(env,row,[row.anchor_id,row.iracing_anchor_id].filter(Boolean),{left:2});
      await env.DB.prepare('UPDATE discord_recap_publications SET closed_at=? WHERE community_id=? AND event_id=? AND closed_at IS NULL').bind(timestamp,row.community_id,row.event_id).run();
      deleted++;
    } catch (error) {
      await env.DB.prepare('UPDATE community_recap_settings SET last_error=? WHERE community_id=?').bind(recapError(error),row.community_id).run();
    } finally {
      await env.DB.prepare("UPDATE community_recap_settings SET lock_token='',lock_until=0 WHERE community_id=? AND lock_token=?").bind(row.community_id,token).run();
    }
  }
  return deleted;
}

