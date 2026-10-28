import {effectivePermissions,withBotAccess,VOICE_ACCESS} from './discord-permissions.mjs';
import {iracingSoloSql} from './iracing-visibility.mjs';
// Text recaps configured explicitly by an admin, published exclusively by the bot.
import {loadWeeklyDiscordSnapshot, loadCalendarSnapshot, siteOf} from './discord-weekly.mjs';
import {buildWeeklyDiscordPayload, buildWeekHeadPayload, buildCalendarPayload, CATEGORY_EMOJI_NAMES} from './discord-weekly-format.mjs';
import {tdzOnly} from '../shared/catalog.mjs';
import {isDevelopment} from './dev-environment.mjs';
import {crewVoiceName} from './crew-discord.mjs';
import {discordAbsentButton} from './discord-interactions.mjs';
import {CATEGORY_NAMES,parseLayout,parseCategories,layoutInput,layoutPlan,wantedCategories,chosenPlaces} from './discord-layout.mjs';

const API = 'https://discord.com/api/v10', DAY = 86400000;
// Layout of the recap message: raised when it changes, so the published recaps are edited once.
const RECAP_FORMAT = 12;
const MAX_CHANNELS = 450;
const RACE_INFO_CHANNEL = 'infos-de-la-course'; // Discord writes text channel names in lowercase with dashes
const VIEW = 1024n, SEND = 2048n, HISTORY = 65536n, EMBED = 16384n, MANAGE = 16n, ADMIN = 8n, EVERYONE = 131072n;
// The morning announcement: written in the channel, with @everyone.
const ANNOUNCE_REQUIRED = VIEW | SEND | EMBED | EVERYONE;
const REQUIRED = VIEW | SEND | HISTORY | EMBED;
// Written in a channel of the admins: the races' threads are opened there too.
const INSIDE_REQUIRED = REQUIRED | (1n << 35n) | (1n << 38n);
// The races' threads: making them, writing in them, deleting them once the race is over.
export const THREADS = (1n << 34n) | (1n << 35n) | (1n << 38n);
export const RECAP_BOT_PERMISSIONS = String(REQUIRED | MANAGE | THREADS);
export const botRecapSettings = (env, community) => env.DB.prepare('SELECT * FROM community_recap_settings WHERE community_id=?').bind(community.id).first();
// Each recap has its own place (migration 0079): destination_id for the LMU races, iracing_destination_id for the iRacing
// ones (a category in « une catégorie par course », a text channel in « récap de la semaine »), calendar_destination_id for
// the week's events. '' = not published. The week's messages are publications « week:lmu », « week:iracing », « week:calendar ».
const WEEK = {lmu:'week:lmu', iracing:'week:iracing', calendar:'week:calendar'};
const isRaceRow = row => Boolean(row?.event_id) && !String(row.event_id).startsWith('week:');
const isIracing = event => String(event?.circuit || '').startsWith('iracing-');
// The category a race goes under; none in « récap de la semaine », nor once everything is taken off (enabled 0).
// With the setting asked question by question, the sync keeps destination_id / iracing_destination_id on the bot's categories.
const anchorOf = (settings, event) => settings.enabled === 0 || settings.mode !== 'events' ? '' : (isIracing(event) ? settings.iracing_destination_id : settings.destination_id) || '';
// The admins' categories and channels: never deleted.
const anchorIds = settings => [settings.destination_id, settings.iracing_destination_id, settings.calendar_destination_id].filter(Boolean);
// The races that get a category: 'all', 'lmu', 'iracing', or null.
// With the setting asked question by question, every race of the sims shown gets its thread, in both modes.
export const scopeOf = settings => {
  const layout = parseLayout(settings.layout);
  if (layout) return settings.enabled === 0 ? null : layout.sims || 'all';
  return settings.enabled === 0 || settings.mode !== 'events' ? null : settings.destination_id && settings.iracing_destination_id ? 'all'
    : settings.destination_id ? 'lmu' : settings.iracing_destination_id ? 'iracing' : null;
};
// Whether a race gets its own place (its thread, or its category before the setting asked question by question).
const raceOn = (settings, event) => {
  const scope = scopeOf(settings);
  return Boolean(event) && (parseLayout(settings.layout) ? scope === 'all' || scope === (isIracing(event) ? 'iracing' : 'lmu') : Boolean(anchorOf(settings, event)));
};
function weekDestination(settings, kind, community) {
  if (kind === 'calendar') return community.modules?.soloRaces === true ? settings.calendar_destination_id || '' : '';
  return settings.mode === 'general' ? (kind === 'iracing' ? settings.iracing_destination_id : settings.destination_id) || '' : '';
}
// Several messages in one channel keep the order they were sent in: the TDZ calendar comes first.
const messageOrder = (env, community) => tdzOnly(community, isDevelopment(env)) ? ['calendar','lmu','iracing'] : ['lmu','iracing','calendar'];
const MESSAGE_NAMES = {lmu:'Endurances LMU', iracing:'Endurances iRacing', calendar:'Calendrier de la semaine', head:'Bannière de la semaine'};
// In the category chosen for a week's recap, the bot makes its own text channel (with its rights): the endurances share one.
export const WEEK_CHANNELS = {races:'récap-de-la-semaine', calendar:'calendrier-de-la-semaine'};
const weekGroup = kind => kind.startsWith('calendar') ? 'calendar' : 'races';
const eventChannelOf = (env, community) => tdzOnly(community, isDevelopment(env)) ? 'event-tdz-de-la-semaine' : 'event-solo-de-la-semaine';
// The week's messages wanted now, in the order they are sent: {kind, destination, channel (its name), topic, sim (calendar
// filter), key (kept in category_id: a change of place or of channel moves the message)}. cats: the bot's categories.
function weekPlan(env, community, settings, cats = parseCategories(settings.bot_categories)) {
  if (settings.enabled === 0) return [];
  const order = messageOrder(env, community), rank = kind => order.indexOf(kind.split(':')[0]);
  const layout = parseLayout(settings.layout);
  const week = layout
    ? layoutPlan(layout, cats, {eventChannel:eventChannelOf(env, community), calendar:community.modules?.soloRaces === true}).week.map(entry => ({...entry, key:entry.inside ? `in:${entry.destination}` : `${entry.destination}#${entry.channel}`}))
    // A setting made before: its channels as they were (« récap-de-la-semaine », « calendrier-de-la-semaine »).
    : order.map(kind => ({kind, destination:weekDestination(settings, kind, community), channel:WEEK_CHANNELS[weekGroup(kind)], topic:weekGroup(kind), sim:null}))
      .filter(entry => entry.destination).map(entry => ({...entry, key:entry.destination}));
  week.sort((a,b) => rank(a.kind) - rank(b.kind));
  if (!layout) return week;
  // Above the sims' messages of a channel, one message of its own: the banner, the week and the link to the site. The sims'
  // messages below it all look the same.
  const plan = [];
  for (const entry of week) {
    const same = entry.kind.startsWith('calendar') ? [] : week.filter(item => !item.kind.startsWith('calendar') && item.key === entry.key);
    if (same[0] === entry) plan.push({...entry, kind:`head:${entry.kind}`, sims:same.map(item => item.kind)});
    plan.push(entry);
  }
  return plan;
}
const parse = value => { try { const result = JSON.parse(value); return Array.isArray(result) ? result : []; } catch { return []; } };

export function recapError(error) {
  if (error.rights) return error.message;
  if (error.status === 429) return 'Discord limite les requêtes. Le récap réessaiera automatiquement.';
  if (error.status === 403) {
    // Not every 403 is a missing permission: an admin bot gets these too.
    const where = `(Discord ${error.code || 403}${error.path ? ` sur ${error.path.split('?')[0]}` : ''})`;
    if (error.code === 50005) return `Discord refuse que le bot modifie un message qu’il n’a pas écrit. Clique sur Réparer le récap pour le republier. ${where}`;
    if (error.code === 160005 || error.code === 50083) return `Un fil de course est verrouillé ou archivé sur Discord. Rouvre-le ou clique sur Réparer le récap. ${where}`;
    return `Dans les permissions du salon ou de la catégorie, autorise le bot à Voir le salon, Envoyer des messages, Intégrer des liens et Voir les anciens messages ; en mode par événement, ajoute Gérer les salons. ${where}`;
  }
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
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Discord's « try again in … » when it is short enough to wait for (in ms), else null.
export async function retryAfter(response) {
  if (response.status !== 429) return null;
  const data = await response.clone().json().catch(() => null), seconds = Number(data?.retry_after ?? response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds <= 5 ? Math.ceil(seconds * 1000) + 50 : null;
}
// The last request allowed on this route for now (Discord says so in its answer): wait for the next one, rather than be refused.
export async function spaceOut(response) {
  const seconds = Number(response.headers?.get?.('x-ratelimit-reset-after'));
  if (response.headers?.get?.('x-ratelimit-remaining') === '0' && Number.isFinite(seconds) && seconds > 0) await pause(Math.min(seconds, 5) * 1000 + 50);
}
async function discord(env, method, path, body, budget = {left:12}) {
  if (!String(env.DISCORD_BOT_TOKEN || '').trim()) throw Object.assign(new Error('Le bot du site n’est pas configuré.'), {status:401});
  if (--budget.left < 0) throw Object.assign(new Error('Lot terminé ; les autres événements seront traités au prochain passage.'), {budget:true});
  // Something made, moved or deleted on the server (not a message): its list of channels is read again.
  if (method !== 'GET' && !path.includes('/messages')) budget.moved = true;
  const call = () => fetch(API + path, {method, signal:AbortSignal.timeout(8000),
    headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`, ...(body ? {'Content-Type':'application/json'} : {})}, body:body ? JSON.stringify(body) : undefined});
  let response = await call();
  // A short wait asked by Discord (several requests at once on the same server): one more try, the first was not done.
  const wait = await retryAfter(response);
  if (wait !== null) response = await (await pause(wait), call());
  await spaceOut(response);
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error('Discord indisponible'), {status:response.status, code:data?.code, path});
  return data;
}
// The same requests for the morning announcement (server/discord-announce.mjs).
export const discordRequest = discord;
// Closed to @everyone (« Voir le salon » refused): only the roles allowed there see it.
const isPrivate = (channel, guildId) => (channel.permission_overwrites || []).some(item => String(item.id) === String(guildId) && Number(item.type) === 0 && (BigInt(item.deny || 0) & VIEW));
export async function recapDestinations(env, community) {
  if (!community.discordGuildId || !env.DISCORD_CLIENT_ID) throw Object.assign(new Error('Relie le serveur de la communauté au bot.'), {status:401});
  const guild = community.discordGuildId;
  const [channels, roles, member] = await Promise.all([
    discord(env, 'GET', `/guilds/${guild}/channels`), discord(env, 'GET', `/guilds/${guild}/roles`),
    discord(env, 'GET', `/guilds/${guild}/members/${env.DISCORD_CLIENT_ID}`)]);
  if (!Array.isArray(channels) || !Array.isArray(roles) || !member) throw new Error('Réponse Discord invalide.');
  // The announcement channels (type 5) only serve the morning announcement.
  return channels.filter(channel => [0,4,5].includes(channel.type)).map(channel => {
    // Below a text channel the bot makes its own: what counts is its category (or the server).
    const parent = channel.type === 0 ? channels.find(item => item.id === channel.parent_id && item.type === 4) : null;
    const rights = effectivePermissions(roles, member, guild, channel.type === 0 ? parent || {id:'',permission_overwrites:[]} : channel, env.DISCORD_CLIENT_ID);
    const voiceRequired = channel.type === 4 && community.modules?.crewChannels === true;
    const required = REQUIRED | MANAGE | (voiceRequired ? VOICE_ACCESS : 0n);
    // Written in the channel itself: its own rights count.
    const own = channel.type !== 4 ? effectivePermissions(roles, member, guild, channel, env.DISCORD_CLIENT_ID) : 0n;
    return {id:channel.id, name:channel.name, type:channel.type, position:channel.position || 0, parentId:channel.parent_id || null, parentName:parent?.name || null, ready:(rights & required) === required,
      private:isPrivate(channel.type === 0 ? parent || channel : channel, guild),
      missing:[['Voir le salon',VIEW],['Envoyer des messages',SEND],['Voir les anciens messages',HISTORY],['Intégrer des liens',EMBED],['Gérer les salons',MANAGE],...(voiceRequired ? [['Se connecter',1n << 20n]] : [])].filter(([,bit]) => !(rights & bit)).map(([label]) => label),
      ...(channel.type !== 4 ? {announceReady:(own & ANNOUNCE_REQUIRED) === ANNOUNCE_REQUIRED,
        announceMissing:[['Voir le salon',VIEW],['Envoyer des messages',SEND],['Intégrer des liens',EMBED],['Mentionner @everyone',EVERYONE]].filter(([,bit]) => !(own & bit)).map(([label]) => label)} : {}),
      ...(channel.type === 0 ? {insideReady:(own & INSIDE_REQUIRED) === INSIDE_REQUIRED,
        insideMissing:[['Voir le salon',VIEW],['Envoyer des messages',SEND],['Voir les anciens messages',HISTORY],['Intégrer des liens',EMBED],['Créer des fils publics',1n << 35n],['Envoyer des messages dans les fils',1n << 38n]].filter(([,bit]) => !(own & bit)).map(([label]) => label)} : {})};
  });
}
// Below a text channel, the bot makes its own in that channel's category: its rights count there, so the message names it.
function rightsError(place) {
  const category = place.type === 4 ? place.name : place.parentName;
  const where = category ? `de la catégorie « ${category} »${place.type === 0 ? ` (celle de « ${place.name} »)` : ''}` : 'du rôle « Endurance Manager » (Paramètres du serveur › Rôles)';
  return Object.assign(new Error(`Dans les permissions ${where}, autorise le bot : ${place.missing.join(', ')}.`), {status:400});
}
// Written in a channel: its own permissions.
const insideError = place => Object.assign(new Error(`Dans les permissions du salon « ${place.name} », autorise le bot : ${place.insideMissing.join(', ')}.`), {status:400});
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
// The columns the rest of the code reads (the races' categories), from the answers and the bot's categories.
function layoutAnchors(layout, cats) {
  const {anchors} = layoutPlan(layout, cats);
  return {mode:layout.mode, scope:anchors.lmu && anchors.iracing ? 'all' : anchors.iracing ? 'iracing' : 'lmu',
    destination_id:anchors.lmu, iracing_destination_id:anchors.iracing};
}
// The answers of the setting asked question by question, checked against the server: the places chosen exist and the bot
// has its rights there, and on the server itself when it makes its own categories. A settings row to save.
export async function validateDiscordLayout(env, community, input) {
  const layout = layoutInput(input);
  const destinations = await recapDestinations(env, community);
  for (const chosen of chosenPlaces(layout)) {
    if (chosen.startsWith('in:')) {
      const place = destinations.find(item => item.id === chosen.slice(3) && item.type === 0);
      if (!place) throw Object.assign(new Error('Choisis un salon qui existe sur le serveur Discord de cette communauté.'), {status:400});
      if (!place.insideReady) throw insideError(place);
      continue;
    }
    const id = chosen, place = destinations.find(item => item.id === id);
    const category = id === layout.under || id === layout.pitAt;
    if (!place || (category && place.type !== 4)) throw Object.assign(new Error('Choisis un endroit qui existe sur le serveur Discord de cette communauté.'), {status:400});
    if (!place.ready && !(id === layout.pitAt && layout.pit === 'bot') && id !== layout.under) throw rightsError(place);
  }
  if (layout.announce) {
    const place = destinations.find(item => item.id === layout.announce && [0,5].includes(item.type));
    if (!place) throw Object.assign(new Error('Choisis un salon qui existe sur le serveur Discord de cette communauté pour l’annonce du jour.'), {status:400});
    if (!place.announceReady) throw Object.assign(new Error(`Dans les permissions du salon « ${place.name} », autorise le bot : ${place.announceMissing.join(', ')}.`), {status:400});
    // Turned on (or moved) now: announced today already, then every morning (server/discord-announce.mjs).
    const before = parseLayout((await botRecapSettings(env, community))?.layout);
    layout.announceAt = before?.announce === layout.announce && before.announceAt ? before.announceAt : Date.now();
  }
  if (wantedCategories(layout).length) {
    const server = await serverRights(env, community);
    if (server.missing.length) throw Object.assign(new Error(`Pour créer ses catégories, le bot a besoin sur le serveur de : ${server.missing.join(', ')}. Invite-le à nouveau avec ses droits.`), {status:400});
  }
  return {...settingsRow(layout.mode), layout:JSON.stringify(layout)};
}
// The bot's rights on the whole server (what its own categories need).
export async function serverRights(env, community) {
  const guild = community.discordGuildId;
  const [roles, member] = await Promise.all([discord(env, 'GET', `/guilds/${guild}/roles`), discord(env, 'GET', `/guilds/${guild}/members/${env.DISCORD_CLIENT_ID}`)]);
  const rights = effectivePermissions(roles, member, guild, {id:'',permission_overwrites:[]}, env.DISCORD_CLIENT_ID);
  const missing = [['Voir les salons',VIEW],['Envoyer des messages',SEND],['Voir les anciens messages',HISTORY],['Intégrer des liens',EMBED],['Gérer les salons',MANAGE]]
    .filter(([,bit]) => !(rights & bit)).map(([label]) => label);
  return {ready:!missing.length, missing};
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
    if (!destination.ready) throw rightsError(destination);
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
// races: all of them when the community shows them on its site (module « iracingImport »), otherwise only those where it
// has something.
async function openRaces(env, community, events, scope, timestamp) {
  if (community.modules?.iracingImport === true) return racesOpenNow(events, scope, timestamp);
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
// The categories in their place: the bot's own (each followed by its races) just below the category chosen for them,
// « Pit talk » just below its own; a setting made before: the races after the category chosen for their sim.
async function placeCategories(env, community, guildId, channels, category, settings, budget) {
  const layout = parseLayout(settings.layout);
  if (!layout) return placeCategory(env, community, guildId, channels, category, settings, budget);
  const cats = parseCategories(settings.bot_categories), keys = wantedCategories(layout).filter(key => cats[key]);
  const open = new Map(((await env.DB.prepare(`SELECT p.category_id,e.circuit,e.departures FROM discord_recap_publications p LEFT JOIN events e ON e.id=p.event_id
    WHERE p.community_id=? AND p.closed_at IS NULL AND p.category_id IS NOT NULL AND p.event_id NOT LIKE 'week:%'`).bind(community.id).all()).results || [])
    .map(item => [item.category_id,[String(item.circuit || '').startsWith('iracing-') ? 1 : 0,Math.min(...parse(item.departures).map(start => Number(start.startsAt)).filter(Number.isFinite))]]));
  const categories = channels.filter(item => item.type === 4).sort((a,b) => (a.position || 0) - (b.position || 0) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  if (category && !categories.some(item => item.id === category)) categories.push({id:category});
  const bots = keys.map(key => cats[key]), key = item => open.get(item.id);
  const races = categories.filter(item => open.has(item.id) && !bots.includes(item.id)).sort((a,b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]);
  const order = categories.filter(item => !bots.includes(item.id) && !races.includes(item));
  const after = (at, items) => {
    if (!items.length) return;
    const index = at === 'top' ? -1 : order.findIndex(item => item.id === at);
    if (at !== 'top' && index < 0) order.push(...items); else order.splice(index + 1, 0, ...items);
  };
  const raceOf = id => races.filter(item => (key(item)[0] === 1 ? settings.iracing_destination_id : settings.destination_id) === id);
  after(layout.under, keys.filter(key => key !== 'pit').flatMap(key => [{id:cats[key]}, ...raceOf(cats[key])]));
  if (keys.includes('pit')) after(layout.pitAt, [{id:cats.pit}]);
  order.push(...races.filter(item => !order.includes(item)));
  if (order.every((item,index) => item.id === categories[index]?.id)) return;
  await discord(env,'PATCH',`/guilds/${guildId}/channels`,order.map((item,position) => ({id:item.id,position})),budget);
}
// The crews' voices in each category: LMU first, then iRacing, each by its start (server/crew-discord.mjs sorts them when one
// is made, a pass that can stop on the way). Other voices stay first, as they are. One request, only when out of order.
async function placeVoices(env, community, guildId, channels, budget) {
  const rows = (await env.DB.prepare(`SELECT d.voice_id, d.created_at, c.departure_id, c.name AS crew_name, e.name AS event_name, e.circuit, e.departures FROM crew_discord d
    JOIN crews c ON c.id=d.crew_id JOIN events e ON e.id=c.event_id WHERE d.community_id=? AND d.closed_at IS NULL AND d.voice_id IS NOT NULL`).bind(community.id).all()).results || [];
  // Named as now wanted (the race's logo in front since it came; a crew renamed on the site).
  for (const item of rows) {
    const voice = channels.find(channel => channel.id === item.voice_id && channel.type === 2), name = crewVoiceName(item);
    if (voice && voice.name !== name) { await discord(env,'PATCH',`/channels/${voice.id}`,{name},budget); voice.name = name; }
  }
  if (rows.length < 2) return;
  const crews = new Map(rows.map(item => [item.voice_id, [isIracing(item) ? 1 : 0,
    Number((parse(item.departures).find(start => start?.id === item.departure_id) || {}).startsAt) || Infinity, Number(item.created_at) || 0]]));
  const byPosition = (a,b) => (a.position || 0) - (b.position || 0) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1);
  for (const parent of new Set(channels.filter(item => item.type === 2 && crews.has(item.id)).map(item => item.parent_id || null))) {
    const voices = channels.filter(item => item.type === 2 && (item.parent_id || null) === parent).sort(byPosition);
    const key = item => crews.get(item.id);
    const wanted = [...voices.filter(item => !crews.has(item.id)), ...voices.filter(item => crews.has(item.id))
      .sort((a,b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1] || key(a)[2] - key(b)[2])];
    if (wanted.every((item,index) => item === voices[index])) continue;
    await discord(env,'PATCH',`/guilds/${guildId}/channels`,wanted.map((item,position) => ({id:item.id,position})),budget);
    wanted.forEach((item,position) => { item.position = position; });
  }
}
const categoryAccess = community => REQUIRED | MANAGE | (community.modules?.crewChannels === true ? VOICE_ACCESS : 0n);
// What the bot may copy (it can only give rights it has): seeing, writing, joining.
const SHARED = VIEW | SEND | HISTORY | EMBED | (1n << 20n);
// The rights of a channel without the bot's own, in a stable order (to compare them).
function othersRules(env, overwrites) {
  return (overwrites || []).filter(item => !(Number(item.type) === 1 && String(item.id) === String(env.DISCORD_CLIENT_ID)))
    .map(item => ({id:String(item.id), type:Number(item.type), allow:String(BigInt(item.allow || 0) & SHARED), deny:String(BigInt(item.deny || 0) & SHARED)}))
    .filter(item => item.allow !== '0' || item.deny !== '0').sort((a,b) => a.id.localeCompare(b.id));
}
// The rights a bot category should have: those of the category it sits under when the admins chose so, else none (open to all).
function categoryRules(env, layout, key, channels) {
  const [copy, at] = key === 'pit' ? [layout?.pitCopy, layout?.pitAt] : [layout?.copy, layout?.under];
  return copy && at && at !== 'top' ? othersRules(env, channels.find(item => item.id === at)?.permission_overwrites) : [];
}
// The bot's categories kept private or open as chosen, and what the bot made in them (their channels, voices and the races'
// categories): changed only where they differ. Discord needs « Gérer les rôles » for it.
async function shareRights(env, community, settings, rows, channels, budget) {
  const layout = parseLayout(settings.layout), cats = parseCategories(settings.bot_categories);
  const races = rows.filter(row => isRaceRow(row) && row.category_id && !row.closed_at).map(row => row.category_id);
  for (const [key, id] of Object.entries(cats)) {
    const rules = categoryRules(env, layout, key, channels), wanted = JSON.stringify(rules);
    const below = key === 'pit' ? [] : channels.filter(item => races.includes(item.id) && [settings.destination_id, settings.iracing_destination_id].includes(id));
    const targets = [id, ...below.map(item => item.id)].flatMap(parent => [channels.find(item => item.id === parent), ...channels.filter(item => item.parent_id === parent)]).filter(Boolean);
    for (const channel of targets) {
      if (JSON.stringify(othersRules(env, channel.permission_overwrites)) === wanted) continue;
      const mine = (channel.permission_overwrites || []).filter(item => Number(item.type) === 1 && String(item.id) === String(env.DISCORD_CLIENT_ID));
      const access = channel.type === 4 ? categoryAccess(community) : channel.type === 2 ? VOICE_ACCESS : REQUIRED;
      const permission_overwrites = withBotAccess([...rules, ...mine], env.DISCORD_CLIENT_ID, access);
      await discord(env,'PATCH',`/channels/${channel.id}`,{permission_overwrites},budget).catch(error => {
        if ([403].includes(error.status) || error.code === 50013) throw Object.assign(new Error('Pour rendre la catégorie du bot privée ou publique, il lui faut « Gérer les rôles » : invite-le à nouveau avec ses droits.'), {rights:true});
        throw error;
      });
      channel.permission_overwrites = permission_overwrites;
    }
  }
}
// The bot's own categories: the missing ones made (with its rights), then their ids kept. channels: the server's, updated.
async function makeCategories(env, community, settings, channels, budget) {
  const layout = parseLayout(settings.layout), cats = parseCategories(settings.bot_categories);
  const wanted = settings.enabled === 0 ? [] : wantedCategories(layout);
  let changed = false;
  for (const key of wanted) {
    const mine = cats[key] && channels.find(item => item.id === cats[key] && item.type === 4);
    if (mine) {
      // Made with an older name (before its emoji): renamed once.
      if (mine.name !== CATEGORY_NAMES[key]) { await discord(env,'PATCH',`/channels/${mine.id}`,{name:CATEGORY_NAMES[key]},budget); mine.name = CATEGORY_NAMES[key]; }
      continue;
    }
    // Taken back if the bot made it already (a lost answer), never a category of the admins with the same name.
    const created = await discord(env,'POST',`/guilds/${settings.guild_id}/channels`,{type:4,name:CATEGORY_NAMES[key],
      permission_overwrites:withBotAccess(categoryRules(env, layout, key, channels),env.DISCORD_CLIENT_ID,categoryAccess(community))},budget);
    channels.push(created);
    cats[key] = created.id; changed = true;
  }
  if (changed) {
    settings.bot_categories = JSON.stringify(cats);
    await env.DB.prepare('UPDATE community_recap_settings SET bot_categories=? WHERE community_id=?').bind(settings.bot_categories,community.id).run();
  }
  return {cats, wanted};
}
// The bot's categories no longer wanted: deleted once empty (Discord would put what is left in them at the top of the server).
async function removeCategories(env, community, settings, channels, wanted, budget) {
  const cats = parseCategories(settings.bot_categories);
  let changed = false, waiting = false;
  for (const [key, id] of Object.entries(cats)) {
    if (wanted.includes(key) && (settings.enabled !== 0)) continue;
    if (channels.some(item => item.parent_id === id)) { waiting = true; continue; }
    if (channels.some(item => item.id === id)) await discord(env,'DELETE',`/channels/${id}`,null,budget).catch(error => { if (error.status !== 404) throw error; });
    delete cats[key]; changed = true;
  }
  if (changed) {
    settings.bot_categories = JSON.stringify(cats);
    await env.DB.prepare('UPDATE community_recap_settings SET bot_categories=? WHERE community_id=?').bind(settings.bot_categories,community.id).run();
  }
  return waiting;
}
// The race's text channel or thread, then its category (never a category chosen by the admins).
async function removeRaceChannels(env, row, anchors, budget) {
  for (const id of [row.channel_id, !anchors.includes(row.category_id) ? row.category_id : null].filter(Boolean)) {
    try { await discord(env,'DELETE',`/channels/${id}`,null,budget); }
    catch (error) {
      if (error.status === 404) continue;
      // Deleting a thread asks for « Gérer les fils » (a bot invited before it): archived instead, out of the list.
      if (error.status === 403 && row.in_thread && id === row.channel_id) { await discord(env,'PATCH',`/channels/${id}`,{archived:true},budget).catch(() => {}); continue; }
      throw error;
    }
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
// alone: a race's thread (its block only).
// threads: « un fil par course », the week's message lists the races with a link to their threads ({eventId: thread}).
async function snapshotPayload(env, timestamp, community, eventId = null, kind = null, sim = null, alone = false, threads = null, sims = null) {
  if (kind?.startsWith('head')) {
    const scope = sims?.length > 1 ? 'all' : kind.slice(5);
    const {periodLabel} = await loadWeeklyDiscordSnapshot(env, timestamp, community, scope === 'all' ? 'lmu' : scope);
    const payload = buildWeekHeadPayload(periodLabel, siteOf(env, community), scope);
    return {snapshot:{periodLabel}, payload, hash:await digest([RECAP_FORMAT,'head',payload])};
  }
  if (kind?.startsWith('calendar')) {
    const snapshot = await loadCalendarSnapshot(env, timestamp, community, sim);
    const payload = buildCalendarPayload(snapshot, siteOf(env, community), timestamp);
    return {snapshot, payload, hash:await digest([RECAP_FORMAT,'calendar',snapshot])};
  }
  const scope = eventId ? 'all' : kind;
  const snapshot = await loadWeeklyDiscordSnapshot(env, timestamp, community, scope, eventId);
  const emojis = await botCategoryEmojis(env, timestamp);
  const payload = buildWeeklyDiscordPayload(snapshot, siteOf(env, community), timestamp, scope, emojis, {weekly:!eventId, alone:Boolean(eventId) && alone, threads:eventId ? null : threads, absent:discordAbsentButton(env)});
  // Message edits are silent; never turn driver names into mentions.
  payload.allowed_mentions = {parse:[]};
  // A new layout of the message (RECAP_FORMAT) edits the published recaps once.
  return {snapshot, payload, hash:await digest([RECAP_FORMAT,snapshot,emojis,...(eventId && alone ? ['alone', Boolean(discordAbsentButton(env))] : []),...(!eventId && threads ? [threads, 'head'] : [])])};
}
// What the bot would publish with these settings (a settings row), without publishing anything.
export async function previewBotRecap(env, timestamp, community, settings) {
  const previews = [], layout = parseLayout(settings.layout);
  // The bot's categories not made yet stand in for themselves.
  const cats = layout ? Object.fromEntries(wantedCategories(layout).map(key => [key, parseCategories(settings.bot_categories)[key] || `new-${key}`])) : undefined;
  for (const entry of weekPlan(env, community, settings, cats)) {
    const {payload} = await snapshotPayload(env, timestamp, community, null, entry.kind, entry.sim, false, layout && !entry.kind.startsWith('calendar') ? {} : null, entry.sims);
    const name = layout ? `# ${entry.channel}` : entry.kind === 'calendar' ? settings.calendar_destination_name : entry.kind === 'iracing' ? settings.iracing_destination_name : settings.destination_name;
    previews.push({eventId:'week:' + entry.kind, name:`${name} · ${MESSAGE_NAMES[entry.kind.split(':')[0]]}`, payload});
  }
  if (layout) Object.assign(settings, layoutAnchors(layout, cats));
  const scope = scopeOf(settings);
  if (!scope) return previews;
  const events = await raceEvents(env, community);
  for (const eventId of await openRaces(env, community, events, scope, timestamp)) {
    if (previews.length === 10) break;
    const {snapshot, payload} = await snapshotPayload(env, timestamp, community, eventId, null, null, Boolean(layout));
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
      iracing_destination_id=?,iracing_destination_name=?,calendar_destination_id=?,calendar_destination_name=?,layout=?,revision=revision+1,last_error=NULL
      WHERE community_id=? AND lock_token=?`)
      .bind(Number(enabled),Number(adopted),settings.mode,settings.scope,community.discordGuildId,settings.destination_id,settings.destination_name,
        settings.iracing_destination_id,settings.iracing_destination_name,settings.calendar_destination_id,settings.calendar_destination_name,settings.layout || '',community.id,token).run();
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
async function publish(env, timestamp, community, settings, row, event, budget, prepared = null, repair = false, entry = null) {
  const isEvent = isRaceRow(row);
  if (isEvent) await env.DB.prepare('UPDATE discord_recap_publications SET delete_after=? WHERE community_id=? AND event_id=?').bind(eventDeletionTime(event),community.id,row.event_id).run();
  if (row.closed_at) return;
  let channel = row.channel_id;
  const kind = isEvent ? null : row.event_id.slice(5);
  if (!isEvent) {
    // Set up for this place (a recap posted straight into a channel by an older version is moved to its own).
    const placed = Boolean(row.category_id) && row.category_id === entry.key;
    let channels = null;
    if (placed && repair && row.category_id) {
      channels = await discord(env,'GET',`/guilds/${row.guild_id}/channels`,null,budget);
      if (!channels.some(item => item.id === channel)) channel = null;
    }
    if (!placed || !channel) {
      const next = entry.inside ? {channel:entry.destination, category:entry.key} : await weekChannel(env, community, row, entry, budget);
      if (row.channel_id !== next.channel) await takeDown(env, community, row, budget);
      channel = next.channel;
      if (row.channel_id !== channel) { row.message_id = null; row.content_hash = ''; }
      Object.assign(row, {channel_id:channel, category_id:next.category});
      await env.DB.prepare('UPDATE discord_recap_publications SET channel_id=?,category_id=?,message_id=?,content_hash=? WHERE community_id=? AND event_id=?')
        .bind(channel,next.category,row.message_id,row.content_hash,community.id,row.event_id).run();
    }
  }
  const anchors = anchorIds(settings), anchorId = isEvent ? anchorOf(settings, event) : '';
  const layout = parseLayout(settings.layout), threaded = isEvent && Boolean(layout);
  if (threaded) {
    channel = await raceThread(env, community, settings, layout, row, event, budget, repair);
    if (!channel) return;
  } else if (isEvent && (repair || !channel || !row.category_id || anchors.includes(row.category_id))) {
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
      await placeCategories(env,community,row.guild_id,channels,category,settings,budget);
    }
    // Recover a channel created just before a timeout/crash from its exact topic marker, never its name.
    const existing = channel ? channels.find(item => item.id === channel) : channels.find(item => item.type === 0 && item.topic === row.marker);
    if (existing && (existing.parent_id !== category || existing.name !== RACE_INFO_CHANNEL)) await discord(env,'PATCH',`/channels/${existing.id}`,{parent_id:category,name:RACE_INFO_CHANNEL},budget);
    channel = existing?.id || channel || (await discord(env,'POST',`/guilds/${row.guild_id}/channels`,{type:0,name:RACE_INFO_CHANNEL,parent_id:category,topic:row.marker},budget)).id;
    await env.DB.prepare('UPDATE discord_recap_publications SET channel_id=? WHERE community_id=? AND event_id=?').bind(channel,community.id,row.event_id).run();
  }
  const threads = !isEvent && layout && !kind.startsWith('calendar') && !kind.startsWith('head') ? await raceThreads(env, community) : null;
  const {payload, hash} = prepared || await snapshotPayload(env,timestamp,community,isEvent ? row.event_id : null,kind,entry?.sim,threaded,threads,entry?.sims);
  if (!repair && row.message_id && row.content_hash === hash) return;
  if (row.message_id) {
    // A removed message or channel is reported, not recreated on every update (no surprise notifications).
    const edit = () => discord(env,'PATCH',`/channels/${channel}/messages/${row.message_id}`,payload,budget);
    try {
      // A thread quiet for a week is archived by Discord: opened again to be edited.
      await edit().catch(async error => {
        if (!threaded || error.code !== 50083) throw error;
        await discord(env,'PATCH',`/channels/${channel}`,{archived:false},budget);
        await edit();
      });
    }
    catch (error) {
      // The week's channels and the races' threads are the bot's own: a message or channel gone there is put back (silently, flags 4096).
      if ((!isEvent || threaded) && !row.retried && error.status === 404 && [10003,10008].includes(error.code)) {
        if (error.code === 10003) {
          const kept = threaded ? row.category_id : null;
          await env.DB.prepare("UPDATE discord_recap_publications SET channel_id=NULL,category_id=?,message_id=NULL,content_hash='' WHERE community_id=? AND event_id=?").bind(kept,community.id,row.event_id).run();
          Object.assign(row, {channel_id:null, category_id:kept, message_id:null, content_hash:'', retried:true});
          return publish(env, timestamp, community, settings, row, event, budget, prepared, repair, entry);
        }
        error.status = 404; error.code = 10008; repair = true;
      }
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
// The races' threads now open: {eventId: thread}.
const raceThreads = async (env, community) => Object.fromEntries(((await env.DB.prepare("SELECT event_id,channel_id FROM discord_recap_publications WHERE community_id=? AND in_thread=1 AND channel_id IS NOT NULL AND closed_at IS NULL")
  .bind(community.id).all()).results || []).map(row => [row.event_id, row.channel_id]));
// « Un fil par course »: the race's infos in its own thread of # endurances-de-la-semaine (its sim's); its crews' voices in the
// same category, just below (server/crew-discord.mjs). Returns the thread, or null while the week's channel is not there yet.
async function raceThread(env, community, settings, layout, row, event, budget, repair) {
  const gone = error => { if (error.status !== 404) throw error; };
  const week = await env.DB.prepare('SELECT channel_id FROM discord_recap_publications WHERE community_id=? AND event_id=?')
    .bind(community.id, isIracing(event) ? WEEK.iracing : WEEK.lmu).first();
  if (!week?.channel_id) return null;
  const save = () => env.DB.prepare('UPDATE discord_recap_publications SET channel_id=?,category_id=?,message_id=?,content_hash=?,in_thread=?,thread_parent=? WHERE community_id=? AND event_id=?')
    .bind(row.channel_id,row.category_id,row.message_id,row.content_hash,row.in_thread,row.thread_parent || null,community.id,row.event_id).run();
  // A race set up before: its infos-de-la-course channel goes, the thread takes its place.
  if (!row.in_thread && row.channel_id) {
    await discord(env,'DELETE',`/channels/${row.channel_id}`,null,budget).catch(gone);
    Object.assign(row, {channel_id:null, message_id:null, content_hash:''});
    await save();
  }
  // The week's channel made again elsewhere (its threads went with the old one), or « Réparer » on a thread deleted on Discord:
  // the thread is opened again.
  const moved = row.channel_id && row.thread_parent !== week.channel_id;
  if (row.channel_id && (moved || (repair && !await discord(env,'GET',`/channels/${row.channel_id}`,null,budget).catch(error => { gone(error); return null; })))) {
    if (moved) await discord(env,'DELETE',`/channels/${row.channel_id}`,null,budget).catch(gone);
    Object.assign(row, {channel_id:null, message_id:null, content_hash:''});
    await save();
  }
  // A race category made before (its voices now go just below the threads, server/crew-discord.mjs): deleted once its voices
  // have left it.
  const anchors = anchorIds(settings), category = row.category_id && !anchors.includes(row.category_id) ? row.category_id : null;
  if (category) {
    const channels = await discord(env,'GET',`/guilds/${row.guild_id}/channels`,null,budget);
    if (!channels.some(item => item.parent_id === category)) {
      await discord(env,'DELETE',`/channels/${category}`,null,budget).catch(gone);
      row.category_id = null;
      await save();
    }
  }
  if (!row.channel_id || !row.in_thread) {
    // Open a week (Discord's longest): a quiet thread is archived, opened again on its next change.
    const thread = await discord(env,'POST',`/channels/${week.channel_id}/threads`,{name:raceCategoryName(event),type:11,auto_archive_duration:10080},budget).catch(error => {
      if (error.status === 403) throw Object.assign(new Error('Pour ouvrir le fil de chaque course, le bot doit pouvoir « Créer des fils publics » et « Envoyer des messages dans les fils » dans # endurances-de-la-semaine : invite-le à nouveau avec ses droits.'), {rights:true});
      throw error;
    });
    Object.assign(row, {channel_id:thread.id, message_id:null, content_hash:'', in_thread:1, thread_parent:week.channel_id});
    await save();
    // A new thread has nobody in it: everyone is added again, soon.
    await env.DB.prepare('DELETE FROM discord_thread_members WHERE community_id=? AND event_id=?').bind(community.id,row.event_id).run();
    await env.DB.prepare('UPDATE discord_recap_publications SET members_checked_at=0,thread_notice_gone=0 WHERE community_id=? AND event_id=?').bind(community.id,row.event_id).run();
    row.thread_notice_gone = 0;
  }
  // Discord's « Endurance Manager a commencé un fil » in # endurances-de-la-semaine: deleted once (the week's message links the
  // threads already). Not found, or not allowed: left as it is.
  if (!row.thread_notice_gone) {
    const later = error => { if (error.budget || error.status === 429) throw error; return null; };
    const recent = await discord(env,'GET',`/channels/${week.channel_id}/messages?limit=100`,null,budget).catch(later);
    for (const item of (recent || []).filter(item => Number(item.type) === 18 && item.author?.id === env.DISCORD_CLIENT_ID
      && (item.message_reference?.channel_id === row.channel_id || item.content === raceCategoryName(event))))
      await discord(env,'DELETE',`/channels/${week.channel_id}/messages/${item.id}`,null,budget).catch(later);
    row.thread_notice_gone = 1;
    await env.DB.prepare('UPDATE discord_recap_publications SET thread_notice_gone=1 WHERE community_id=? AND event_id=?').bind(community.id,row.event_id).run();
  }
  return row.channel_id;
}
// The week's channel, made by the bot (with its rights) just below the chosen channel, or at the top of the chosen category,
// and found again by its topic. category_id keeps the place chosen for it.
async function weekChannel(env, community, row, entry, budget) {
  const {destination} = entry;
  const channels = await discord(env,'GET',`/guilds/${row.guild_id}/channels`,null,budget);
  const target = channels.find(item => item.id === destination);
  if (!target) throw Object.assign(new Error('Discord indisponible'), {status:404,code:10003,path:`/channels/${destination}`});
  const parent = target.type === 4 ? target.id : target.parent_id || null, category = channels.find(item => item.id === parent);
  const topic = 'endurance-manager:' + (await digest([community.id,'week',destination,entry.topic])).slice(0,24);
  const existing = channels.find(item => item.type === 0 && item.topic === topic);
  if (existing) {
    // Found by its topic: named as now wanted (« 📅・endurances-de-la-semaine » since its emoji).
    if (existing.name !== entry.channel) await discord(env,'PATCH',`/channels/${existing.id}`,{name:entry.channel},budget);
    return {channel:existing.id, category:entry.key};
  }
  const create = rules => discord(env,'POST',`/guilds/${row.guild_id}/channels`,{type:0,name:entry.channel,topic,...(parent ? {parent_id:parent} : {}),...rules},budget);
  // A right the bot does not hold in a copied rule: made without the copy, Discord then gives it the category's rights.
  const created = await create({permission_overwrites:withBotAccess(category?.permission_overwrites,env.DISCORD_CLIENT_ID,REQUIRED)})
    .catch(error => { if (parent && error?.code === 50013) return create({}); throw error; });
  // Its place among the channels of that category: first, or right after the chosen channel (one request).
  const siblings = channels.filter(item => item.type !== 4 && (item.parent_id || null) === parent)
    .sort((a,b) => (a.position || 0) - (b.position || 0) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  siblings.splice(target.type === 4 ? 0 : siblings.findIndex(item => item.id === target.id) + 1, 0, created);
  if (siblings.length > 1) await discord(env,'PATCH',`/guilds/${row.guild_id}/channels`,siblings.map((item,position) => ({id:item.id,position})),budget);
  return {channel:created.id, category:entry.key};
}
// A week's message the admins no longer want (or no longer there): deleted on Discord, with the bot's channel once no recap
// uses it. Already gone: forgotten.
async function takeDown(env, community, row, budget) {
  const ignoreGone = error => { if (error.status !== 404) throw error; };
  if (row.message_id) await discord(env,'DELETE',`/channels/${row.channel_id}/messages/${row.message_id}`,null,budget).catch(ignoreGone);
  await env.DB.prepare("UPDATE discord_recap_publications SET channel_id=NULL,category_id=NULL,message_id=NULL,content_hash='' WHERE community_id=? AND event_id=?").bind(community.id,row.event_id).run();
  // A channel of the admins (written in it) is never deleted.
  if (row.category_id && row.channel_id && row.channel_id !== row.category_id && !row.category_id.startsWith('in:') && !await env.DB.prepare("SELECT 1 FROM discord_recap_publications WHERE community_id=? AND event_id LIKE 'week:%' AND channel_id=?").bind(community.id,row.channel_id).first())
    await discord(env,'DELETE',`/channels/${row.channel_id}`,null,budget).catch(ignoreGone);
  Object.assign(row, {channel_id:null, category_id:null, message_id:null, content_hash:''});
}
async function syncLocked(env,timestamp,community,settings, test = false, budget = {left:12}, priority = null) {
  const rows = (await env.DB.prepare('SELECT * FROM discord_recap_publications WHERE community_id=? AND closed_at IS NULL ORDER BY checked_at,event_id').bind(community.id).all()).results || [];
  const events = await raceEvents(env, community);
  const layout = parseLayout(settings.layout), sameServer = settings.guild_id === community.discordGuildId;
  let channels = null, wanted = [];
  budget.moved = false;
  if (layout && sameServer) {
    // The bot's own categories first: the races, the week's channels and the voices go in them.
    channels = await discord(env,'GET',`/guilds/${settings.guild_id}/channels`,null,budget);
    ({wanted} = await makeCategories(env, community, settings, channels, budget));
    if (settings.enabled !== 0) {
      await shareRights(env, community, settings, rows, channels, budget);
      const cats = parseCategories(settings.bot_categories), anchors = layoutAnchors(layout, cats);
      if (Object.entries(anchors).some(([column, value]) => settings[column] !== value)) {
        await env.DB.prepare(`UPDATE community_recap_settings SET mode=?,scope=?,destination_id=?,iracing_destination_id=?,calendar_destination_id='' WHERE community_id=?`)
          .bind(anchors.mode,anchors.scope,anchors.destination_id,anchors.iracing_destination_id,community.id).run();
        Object.assign(settings, anchors);
      }
      const {voiceCategory} = layoutPlan(layout, cats);
      await env.DB.prepare("UPDATE community_crew_discord SET voice_category_id=? WHERE community_id=? AND COALESCE(voice_category_id,'')<>?")
        .bind(voiceCategory || null,community.id,voiceCategory || '').run();
    }
  }
  // Cleanup is independent of mode/activation. Only bot-created event channels may be deleted: those with something to do
  // first, two per pass (more: another pass soon).
  const races = rows.filter(isRaceRow).map(row => {
    const event = events.find(item => item.id === row.event_id), deleteAt = event ? eventDeletionTime(event) : row.delete_after;
    // A race no longer given a category (« récap de la semaine », its sim not published, or all taken off) loses its channels.
    const unwanted = Boolean(event) && !raceOn(settings, event);
    return {row, deleteAt, unwanted, due:(deleteAt !== null && timestamp >= deleteAt) || (unwanted && Boolean(row.category_id || row.channel_id))};
  });
  const due = races.filter(item => item.due);
  let more = due.length > 2;
  for (const {row, deleteAt, unwanted} of (due.length ? due : races).slice(0,2)) {
    if (deleteAt !== null && timestamp >= deleteAt) {
      await removeRaceChannels(env,row,anchorIds(settings),budget);
      await env.DB.prepare('UPDATE discord_recap_publications SET closed_at=? WHERE community_id=? AND event_id=?').bind(timestamp,community.id,row.event_id).run();
      row.closed_at = timestamp;
    } else if (unwanted && (row.category_id || row.channel_id) && sameServer) {
      // Its crews' voice channels leave it first (server/crew-discord.mjs): deleted with them inside, Discord would put
      // them at the top of the server.
      channels ||= await discord(env,'GET',`/guilds/${settings.guild_id}/channels`,null,budget);
      if (row.category_id && channels.some(item => item.parent_id === row.category_id && item.type === 2)) { more = true; continue; }
      // Forgotten, not closed: back to « une catégorie par course », the race gets its category again.
      await removeRaceChannels(env,row,anchorIds(settings),budget);
      await env.DB.prepare("UPDATE discord_recap_publications SET category_id=NULL,channel_id=NULL,message_id=NULL,content_hash='' WHERE community_id=? AND event_id=?").bind(community.id,row.event_id).run();
      Object.assign(row, {category_id:null, channel_id:null, message_id:null, content_hash:''});
    }
    await env.DB.prepare('UPDATE discord_recap_publications SET checked_at=? WHERE community_id=? AND event_id=?').bind(timestamp,community.id,row.event_id).run();
  }
  if (!sameServer) {
    if (!settings.enabled && !test) return {ok:true,disabled:true};
    throw new Error('Le serveur Discord a changé. Configure à nouveau la destination.');
  }
  // The week's messages, each in its channel; then those no longer wanted are taken down (with their channel once empty).
  const plan = weekPlan(env, community, settings);
  for (const entry of plan) {
    const row = await ensurePublication(env,community,'week:' + entry.kind,settings);
    // Discord keeps messages in the order they were sent: a banner not sent yet goes above the sims' messages already there,
    // which are sent again after it.
    if (entry.kind.startsWith('head') && !row.message_id) for (const sim of entry.sims) {
      const below = await ensurePublication(env,community,'week:' + sim,settings);
      if (!below.message_id || !below.channel_id) continue;
      await discord(env,'DELETE',`/channels/${below.channel_id}/messages/${below.message_id}`,null,budget).catch(error => { if (error.status !== 404) throw error; });
      await env.DB.prepare("UPDATE discord_recap_publications SET message_id=NULL,content_hash='' WHERE community_id=? AND event_id=?").bind(community.id,below.event_id).run();
    }
    await publish(env,timestamp,community,settings,row,null,budget,null,test,entry);
  }
  for (const row of rows.filter(item => !isRaceRow(item) && !plan.some(entry => 'week:' + entry.kind === item.event_id))) {
    if (row.channel_id || row.message_id) await takeDown(env, community, row, budget);
  }
  const scope = scopeOf(settings);
  if (scope) {
    const eligible = await openRaces(env,community,events,scope,timestamp);
    const ids = [...new Set([...rows.filter(row => isRaceRow(row) && !row.closed_at).map(row => row.event_id),...eligible])];
    // The race just changed first, then the ones checked longest ago.
    const ordered = ids.sort((a,b) => (b === priority) - (a === priority) || (rows.find(row => row.event_id === a)?.checked_at || 0) - (rows.find(row => row.event_id === b)?.checked_at || 0));
    // Repair scattered existing categories even when all recap messages are unchanged.
    // The normal creation path already orders newly created categories.
    if (!layout && rows.some(row => isRaceRow(row) && row.category_id && !row.closed_at)) {
      const channels = await discord(env,'GET',`/guilds/${settings.guild_id}/channels`,null,budget);
      await placeCategory(env,community,settings.guild_id,channels,null,settings,budget);
    }
    for (const eventId of ordered.filter(id => raceOn(settings, events.find(item => item.id === id))).slice(0,2)) {
      const event = events.find(item => item.id === eventId);
      if (!event || (eventDeletionTime(event) !== null && timestamp >= eventDeletionTime(event))) continue;
      // Reuse the eligibility/isolation query even for previously published official races.
      const prepared = await snapshotPayload(env,timestamp,community,eventId,null,null,Boolean(layout));
      if (!prepared.snapshot.futureDepartures.length && !rows.some(row => row.event_id === eventId)) continue;
      const row = await ensurePublication(env,community,eventId,settings);
      await publish(env,timestamp,community,settings,row,event,budget,prepared,test);
      await env.DB.prepare('UPDATE discord_recap_publications SET checked_at=? WHERE community_id=? AND event_id=?').bind(timestamp,community.id,eventId).run();
    }
  }
  if (layout && settings.enabled !== 0) {
    // A thread just opened: the week's message links to it now (nothing sent when unchanged).
    for (const entry of plan.filter(item => !item.kind.startsWith('calendar'))) {
      const row = await ensurePublication(env,community,'week:' + entry.kind,settings);
      await publish(env,timestamp,community,settings,row,null,budget,null,false,entry);
    }
  }
  if (layout) {
    // The server as it is now: the categories in their place, the bot's empty ones no longer wanted deleted.
    // Nothing changed on the server since the list read at the start: the same list (one request less per pass).
    const current = channels && !budget.moved ? channels : await discord(env,'GET',`/guilds/${settings.guild_id}/channels`,null,budget);
    await placeCategories(env,community,settings.guild_id,current,null,settings,budget);
    if (community.modules?.crewChannels === true) await placeVoices(env,community,settings.guild_id,current,budget);
    if (await removeCategories(env,community,settings,current,wanted,budget)) more = true;
  }
  return {ok:true, ...(settings.enabled === 0 && !test ? {disabled:true} : {}), ...(more ? {more:true} : {})};
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
    // Something left for a next pass (a category still holding voice channels…): the next pass, 2 minutes later, goes on.
    if (result?.more) await env.DB.prepare('UPDATE community_recap_settings SET dirty=1 WHERE community_id=? AND lock_token=?').bind(community.id,token).run();
    await env.DB.prepare('UPDATE community_recap_settings SET last_error=NULL WHERE community_id=? AND lock_token=?').bind(community.id,token).run();
    return result;
  } catch (error) {
    // Out of requests for this pass (a new setting can take several): not an error, the next pass goes on.
    if (error.budget) {
      await env.DB.prepare('UPDATE community_recap_settings SET dirty=1 WHERE community_id=? AND lock_token=?').bind(community.id,token).run();
      return {ok:true,partial:true};
    }
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
  const layout = parseLayout(current.layout);
  if (layout) await validateDiscordLayout(env,community,layout);
  else await validateRecapDestinations(env,community,{mode:current.mode,lmuId:current.destination_id,iracingId:current.iracing_destination_id,calendarId:current.calendar_destination_id});
  return syncBotRecaps(env,timestamp,community,true);
}
// « Tout retirer »: the bot takes off everything it made for the setting (messages, channels, the races' and its own
// categories), a few requests per pass; the answers stay for next time.
export async function removeBotDiscord(env,timestamp,community) {
  const result = await env.DB.prepare('UPDATE community_recap_settings SET enabled=0 WHERE community_id=? AND lock_until<?').bind(community.id,Date.now()).run();
  if (!result.meta.changes && await botRecapSettings(env,community)) throw Object.assign(new Error('Une synchronisation est en cours. Réessaie dans un instant.'),{status:409});
  return result.meta.changes ? syncBotRecaps(env,timestamp,community) : {ok:true};
}


// Every 2 minutes: the pilots with access to the site added to the races' threads, so each thread stays in their list on
// Discord, 50 at a time per thread. Those of the race first; each added once (one who leaves it stays out). limit: requests.
// A thread with nobody left to add is looked at again an hour later (a pilot given access meanwhile).
export async function addThreadMembers(env, timestamp = Date.now(), limit = 25) {
  if (!env?.DB || !env.DISCORD_BOT_TOKEN) return 0;
  const threads = (await env.DB.prepare(`SELECT p.community_id,p.event_id,p.channel_id,p.guild_id,p.message_id FROM discord_recap_publications p
    JOIN community_recap_settings s ON s.community_id=p.community_id AND s.enabled=1 AND s.guild_id=p.guild_id AND s.lock_until<?
    WHERE p.in_thread=1 AND p.channel_id IS NOT NULL AND p.message_id IS NOT NULL AND p.closed_at IS NULL AND p.members_checked_at<? ORDER BY p.members_checked_at`).bind(Date.now(), timestamp - 3600000).all()).results || [];
  const budget = {left:limit};
  let added = 0;
  for (const thread of threads) {
    // On the server, with « Accès Endurance Manager » (a role, @everyone, or a Discord admin).
    const pilots = (await env.DB.prepare(`SELECT m.user_id FROM memberships m WHERE m.community_id=? AND m.status='member'
      AND NOT EXISTS (SELECT 1 FROM discord_thread_members t WHERE t.community_id=m.community_id AND t.event_id=? AND t.user_id=m.user_id)
      AND (m.discord_admin=1 OR EXISTS (SELECT 1 FROM community_role_permissions r WHERE r.community_id=m.community_id
        AND (r.discord_role_id=? OR r.discord_role_id IN (SELECT value FROM json_each(m.discord_roles)))
        AND EXISTS (SELECT 1 FROM json_each(r.permissions) WHERE value='access')))
      ORDER BY EXISTS (SELECT 1 FROM registrations g WHERE g.event_id=? AND g.user_id=m.user_id) DESC, m.user_id LIMIT 50`)
      .bind(thread.community_id,thread.event_id,thread.guild_id,thread.event_id).all()).results || [];
    if (!pilots.length) {
      await env.DB.prepare('UPDATE discord_recap_publications SET members_checked_at=? WHERE community_id=? AND event_id=?').bind(timestamp,thread.community_id,thread.event_id).run();
      continue;
    }
    // Added by mentioning them in an EDIT of the race's message, then taken off: an edit notifies nobody (no badge), while a
    // new message with mentions or adding them one by one does.
    const ids = pilots.map(pilot => pilot.user_id), path = `/channels/${thread.channel_id}/messages/${thread.message_id}`;
    try {
      const mention = () => discord(env,'PATCH',path,{content:ids.map(id => `<@${id}>`).join(' '),allowed_mentions:{users:ids}},budget);
      // A thread quiet for a week is archived by Discord: opened again first.
      await mention().catch(async error => {
        if (error.code !== 50083) throw error;
        await discord(env,'PATCH',`/channels/${thread.channel_id}`,{archived:false},budget);
        await mention();
      });
      await discord(env,'PATCH',path,{content:'',allowed_mentions:{parse:[]}},budget);
    } catch (error) {
      // Discord limits the bot's requests, or the thread is archived or gone: next time.
      if (error.budget || error.status === 429) return added;
      continue;
    }
    for (const id of ids) await env.DB.prepare('INSERT OR IGNORE INTO discord_thread_members(community_id,event_id,user_id,added_at) VALUES(?,?,?,?)')
      .bind(thread.community_id,thread.event_id,id,timestamp).run();
    added += ids.length;
    if (budget.left <= 0) break;
  }
  return added;
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

