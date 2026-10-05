import {
  LEGACY_CAR_ALIASES, COOKIE_SESSION, COOKIE_STATE, COOKIE_RETURN, DAY, HttpError, fail, now, id, token, hash, cookie,
  setCookie, cookieNames, siteOrigin, communityLabel, baseDomain, json, redirect, origin, requireDiscord, administrators, identity, owned, personal,
  registrationSelect, registrationParticipant, body, rateLimit, cleanup, returnPath, text, validateEvent, validateRegistration, ANY_CATEGORY
} from './core.mjs';
import {ingestClientError, clientErrorsApi} from './telemetry.mjs';
import {communityRequestsApi, closeCommunityRequest} from './community-requests.mjs';
import {trainingApi, trainingCollector, nextRace} from './training.mjs';
import {racesPath} from './races-path.mjs';
import {CARS, simForEvent} from '../shared/catalog.mjs';
import {currentCommunity, appearanceOf, allCommunities, communityUrl, communitySlug, communityById, communityFromRow} from './community.mjs';
import {isDevelopment} from './dev-environment.mjs';
import {communityAccess, requirePermission, displayRole, PERMISSIONS, DEFAULT_EVERYONE, normalizePermissions, discordGuild, keepDiscordLook, memberPermissions, refreshCommunityMembers} from './access.mjs';
// Solo races: a module each community turns on or off (settings of the members page).
const soloRacesEnabled = (env, community) => community?.modules?.soloRaces === true;
// Name of the events calendar tab, chosen by each community (« EVENT TDZ »).
const eventsLabel = community => typeof community?.modules?.eventsLabel === 'string' && community.modules.eventsLabel ? community.modules.eventsLabel : 'Événements';
import {syncIracingEvents} from './iracing-import.mjs';
import {resetShowcase} from './demo.mjs';
import {syncWeeklyDiscord, sendRecapTest, usesSiteRecap, WEBHOOK_URL} from './discord-weekly.mjs';
import {notify, notificationsApi, departurePilots, eventPilots, crewPilots} from './notifications.mjs';
import {botCanManageChannels, CREW_BOT_PERMISSIONS} from './crew-discord.mjs';
// Official races (iRacing's official endurances, LMU official events): common to every community (migration 0039).
const OFFICIAL = 'official';
// A race of the current community, or an official race: any id from another community answers "introuvable".
async function eventById(env, eventId, community) {
  const row = await env.DB.prepare('SELECT * FROM events WHERE id=? AND (community_id=? OR community_id=?)').bind(eventId, community.id, OFFICIAL).first();
  // A solo race does not exist where solo races are off (production): no entry, edit or crew through its id.
  if (!row || (row.format === 'solo' && !soloRacesEnabled(env, community))) fail(404, 'Événement introuvable.');
  return row;
}
// On an official race, a player acts for one of his communities (chosen at the first step of an entry or a crew;
// the one of an existing entry or crew), not only for the site's one: his membership and the rights of his
// Discord roles there are checked. Returns that community and the actor with his permissions in it.
async function actingCommunity(env, actor, site, communityId, event = null) {
  if (!communityId || communityId === site.id) return {community:site, actor};
  if (event && event.community_id !== OFFICIAL) fail(404, 'Événement introuvable.');
  const target = await communityById(env, communityId);
  if (!target) fail(404, 'Communauté introuvable.');
  const access = await communityAccess(env, actor, target);
  if (access.status !== 'member') fail(403, `Tu n’es pas membre de la communauté ${target.name}.`);
  return {community:target, actor:{...actor, permissions:access.permissions, manager:access.manager}};
}
// Car of a crew: none, or one of the catalog's cars of its category (older names accepted and renamed).
function crewCar(input) {
  if (input.car==null || input.car==='') return '';
  const car=LEGACY_CAR_ALIASES.get(input.car) || text(input.car,100,'Voiture');
  if (!CARS[input.category]?.includes(car)) fail(400,'Choisis une voiture proposée pour cette catégorie.');
  return car;
}
function departureById(event, departureId) {
  const departure = JSON.parse(event.departures).find(d => d.id === departureId);
  if (!departure) fail(404, 'Départ introuvable.');
  return departure;
}
// Real starts were added next to the common "Horaire à définir" start: nobody is on it (no entry, no
// crew), so it is not needed any more and is left out.
async function dropEmptyCommonStart(env, eventId, data) {
  const common = data.departures.find(departure => departure.tbd);
  if (!common || data.departures.length < 2) return;
  const used = eventId && await env.DB.prepare('SELECT 1 FROM registrations WHERE event_id=? AND departure_id=? UNION SELECT 1 FROM crews WHERE event_id=? AND departure_id=? LIMIT 1')
    .bind(eventId, common.id, eventId, common.id).first();
  if (!used) data.departures = data.departures.filter(departure => departure !== common);
}
// An official slot for pilots leaving the common "Horaire à définir" start of the same race.
function slotFor(event, from, departureId) {
  if (!from.tbd) fail(409, 'Ce départ a déjà son horaire.');
  const target = JSON.parse(event.departures).find(d => d.id === departureId);
  if (!target || target.tbd) fail(400, 'Choisis un des horaires proposés.');
  if (target.startsAt <= Date.now()) fail(409, 'Ce départ est passé.');
  return target;
}
// "Mes communautés": the communities where the player is a member (managers: all of them), with the address of
// each site. A feature of the platform (not a community module): empty unless the player has several communities.
async function myCommunities(env, actor, community) {
  const domain = baseDomain(env);
  if (!domain || !actor.user) return [];
  const list = actor.manager ? await allCommunities(env)
    : ((await env.DB.prepare(`SELECT c.* FROM communities c JOIN memberships m ON m.community_id=c.id WHERE m.user_id=? AND m.status='member' ORDER BY c.id`)
      .bind(actor.user.id).all()).results || []).map(communityFromRow);
  // The showcase (community of the main address, when that address is the platform's domain) is never one of them.
  const showcase = (() => { try { return new URL(env.APP_ORIGIN).hostname === domain ? communitySlug(env, null) : ''; } catch { return ''; } })();
  const mine = list.filter(item => item.slug !== showcase).sort((x, y) => x.name.localeCompare(y.name, 'fr')).map(item => ({id:item.id, slug:item.slug, name:item.name, shortName:item.shortName,
    logoUrl:appearanceOf(item).logoUrl, accent:appearanceOf(item).accent, url:`${communityUrl(env, item)}/`, current:item.slug === community.slug, item}));
  if (mine.length < 2) return [];
  // "Gérer tous les équipages" in each (a crew of an official race is created for any of them, whatever the site).
  const memberships = actor.manager ? [] : (await env.DB.prepare("SELECT * FROM memberships WHERE user_id=? AND status='member'").bind(actor.user.id).all()).results || [];
  for (const entry of mine) {
    const membership = memberships.find(row => row.community_id === entry.id);
    entry.manageCrews = actor.manager || Boolean(membership && (await memberPermissions(env, entry.item, membership)).has('manage_registrations'));
    delete entry.item;
  }
  return mine;
}
// Body of an image upload (the banner), read up to `limit` bytes.
async function imageBody(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Image manquante.');
  let size = 0; const chunks = [];
  while (true) { const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); fail(413, 'Image trop lourde (600 Ko au plus).'); } chunks.push(value); }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return all;
}
// Type of an image from its first bytes (never from what the browser says).
function imageType(bytes) {
  const text = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (text(1, 4) === 'PNG' && bytes[0] === 0x89) return 'image/png';
  return null;
}
// Recap messages (community_recaps): one simulator or both.
const RECAP_SCOPES = ['all', 'lmu', 'iracing'];
const RECAP_NAMES = {all:'LMU et iRacing', lmu:'LMU', iracing:'iRacing'};
// A saved webhook is never shown again in full: only the end of its id, to tell which one it is.
const maskWebhook = url => `webhook …${(String(url).match(/webhooks\/(\d+)\//) || [,'????'])[1].slice(-4)}`;
// Invitation of the bot (the site's Discord application) to a community's server: it only reads members and roles.
// Without permissions the bot only reads the members and their roles; the crews on Discord need more
// (server/crew-discord.mjs): the admins invite it again with them.
function botInvite(env, guildId, permissions = '0') {
  if (!env.DISCORD_CLIENT_ID) return null;
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(env.DISCORD_CLIENT_ID)}&scope=bot&permissions=${permissions}${guildId ? `&guild_id=${guildId}&disable_guild_select=true` : ''}`;
}
// « Modules »: whether the bot may make the crews' channels, its invite link with those rights, and what last
// stopped it.
async function crewDiscordState(env, community) {
  const saved = await env.DB.prepare('SELECT last_error, last_error_at FROM community_crew_discord WHERE community_id=?').bind(community.id).first();
  return {botReady:await botCanManageChannels(env, community.discordGuildId), botInviteUrl:botInvite(env, community.discordGuildId, CREW_BOT_PERMISSIONS),
    lastError:community.modules.crewChannels === true ? saved?.last_error || null : null};
}
// Permissions of the actor in the current community (server/access.mjs).
const can = (actor, permission) => Boolean(actor.permissions?.has(permission));
function isRegistrationManager(actor) {
  return can(actor, 'manage_registrations');
}
function canManageRegistration(reg, actor) {
  return owned(reg, actor) || isRegistrationManager(actor);
}
function canManageCrew(crew, actor) {
  return can(actor, 'manage_registrations') || Boolean(actor.user && crew?.owner_user_id === actor.user.id);
}
// `community`: the site's community. An entry of another of the player's communities (on an official race) is shown
// with its community, and is changed on that community's site only.
// `perms`: the player's permissions in each of his other communities; `official`: ids of the official races, whose
// entries all show their community (logo or short name).
function publicRegistration(reg, actor, userNames = new Map(), community = null, names = new Map(), perms = new Map(), official = new Set()) {
  let cars = [];
  try { cars = JSON.parse(reg.car_preferences || '[]'); } catch {}
  if (!Array.isArray(cars) || !cars.length) cars = reg.car ? [reg.car] : [];
  cars = cars.map(car => LEGACY_CAR_ALIASES.get(car) || car);
  const participantUserId = reg.participant_user_id || reg.user_id || '';
  const foreign = Boolean(community && reg.community_id && reg.community_id !== community.id);
  const creatorId = reg.owner_user_id || '';
  const createdForOther = Boolean(creatorId && creatorId !== participantUserId);
  const canSeeCreator = createdForOther && Boolean(actor.user) && (
    actor.user.id === creatorId || actor.user.id === participantUserId || isRegistrationManager(actor)
  );
  return {
    id:reg.id,
    participantId:reg.participant_id,
    name:reg.participant_name||reg.name,
    category:reg.category,
    car:cars[0] || reg.car || '',
    cars,
    carAny:Boolean(reg.car_any),
    roundChoices:JSON.parse(reg.round_choices||'[]'),
    status:reg.status,
    preferredPilot:reg.preferred_pilot || '',
    soloDriver:Boolean(reg.solo_driver),
    version:reg.version,
    discordLinked:Boolean(reg.participant_user_id),
    mine:personal(reg, actor),
    managed:owned(reg,actor)&&!personal(reg,actor),
    canEdit:foreign ? perms.has(reg.community_id) && canManageRegistration(reg, {...actor, permissions:perms.get(reg.community_id)}) : canManageRegistration(reg, actor),
    ...(foreign ? {foreign:true} : {}),
    ...(official.has(reg.event_id) ? {community:names.get(reg.community_id) || null} : {}),
    addedByName:canSeeCreator ? (userNames.get(creatorId) || '') : ''
  };
}
// Archived = every start is in the past (same rule as front/schedule.mjs). "upcoming" keeps a
// one-day margin so a race that just started stays visible, and undated races stay upcoming.
const LAST_START="(SELECT max(CAST(json_extract(d.value,'$.startsAt') AS INTEGER)) FROM json_each(e.departures) d)";
function eventScopeFilter(scope, nowMs=Date.now()) {
  const cutoff=Math.floor(nowMs);
  if (scope==='upcoming') return `(${LAST_START} IS NULL OR ${LAST_START}>${cutoff-86400000})`;
  if (scope==='archived') return `${LAST_START}<=${cutoff}`;
  return '';
}
async function listEvents(env, actor, game='', scope='', community) {
  // Filter by joining events instead of binding id lists: D1 rejects queries with more than 100 bound parameters.
  // Bound in order: the site's community (filters), then the site's community and the player (mine). The races of the community and the official races (iRacing's ones
  // where the community shows the iRacing calendar); on an official race, the entries and crews of every
  // community the player is a member of, never of the others.
  const officialRaces = community.modules?.iracingImport === true ? "e.community_id='official'" : "(e.community_id='official' AND e.circuit NOT LIKE 'iracing-%')";
  const filters=[`(e.community_id=? OR ${officialRaces})`,game==='iracing' ? "(e.format='solo' OR e.circuit LIKE 'iracing-%')" : game==='lmu' ? "(e.format='solo' OR e.circuit NOT LIKE 'iracing-%')" : '', eventScopeFilter(scope), soloRacesEnabled(env, community) ? '' : "COALESCE(e.format,'endurance')!='solo'"].filter(Boolean);
  const where=filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
  const player = actor.user?.id || '';
  const mine = column => `${column} IN (SELECT ? UNION SELECT community_id FROM memberships WHERE user_id=? AND status='member')`;
  const rows = (await env.DB.prepare(`SELECT e.* FROM events e${where} ORDER BY e.created_at DESC, e.id DESC`).bind(community.id).all()).results;
  if (!rows.length) return [];
  const registrations = (await env.DB.prepare(registrationSelect+` JOIN events e ON e.id=r.event_id${where} AND ${mine('r.community_id')} ORDER BY r.created_at,r.rowid`).bind(community.id, community.id, player).all()).results;
  const crews = (await env.DB.prepare(`SELECT c.* FROM crews c JOIN events e ON e.id=c.event_id${where} AND ${mine('c.community_id')} ORDER BY c.created_at,c.id`).bind(community.id, community.id, player).all()).results;
  const memberships = (await env.DB.prepare(`SELECT cm.crew_id,cm.registration_id FROM crew_members cm JOIN crews c ON c.id=cm.crew_id JOIN events e ON e.id=c.event_id${where} AND ${mine('c.community_id')}`).bind(community.id, community.id, player).all()).results;
  // Only registration creators' names are displayed (addedByName).
  const users = (await env.DB.prepare(`SELECT DISTINCT u.id,u.name FROM users u JOIN registrations r ON r.owner_user_id=u.id JOIN events e ON e.id=r.event_id${where} AND ${mine('r.community_id')}`).bind(community.id, community.id, player).all()).results;
  // On official races, every entry and crew shows its community (Discord logo or short name, colour); in the
  // player's other communities, the rights of his Discord roles there apply.
  const official = new Set(rows.filter(row => row.community_id === OFFICIAL).map(row => row.id));
  const names = new Map(), perms = new Map();
  if (official.size) {
    const shown = new Set([...registrations.filter(reg => official.has(reg.event_id)).map(reg => reg.community_id), ...crews.filter(crew => official.has(crew.event_id)).map(crew => crew.community_id)]);
    for (const row of (await env.DB.prepare(`SELECT * FROM communities WHERE ${mine('id')}`).bind(community.id, player).all()).results || []) {
      if (!shown.has(row.id)) continue;
      const item = communityFromRow(row), look = appearanceOf(item);
      names.set(row.id, {id:row.id, name:item.name, shortName:item.shortName, accent:look.accent, logoUrl:look.logoUrl});
      if (row.id === community.id || !actor.user) continue;
      if (actor.manager) { perms.set(row.id, new Set(PERMISSIONS)); continue; }
      const membership = await env.DB.prepare("SELECT * FROM memberships WHERE community_id=? AND user_id=? AND status='member'").bind(row.id, actor.user.id).first();
      if (membership) perms.set(row.id, await memberPermissions(env, item, membership));
    }
  }
  const userNames = new Map(users.map(item => [item.id,item.name]));
  const grouped = new Map();
  for (const reg of registrations) { const key = `${reg.event_id}:${reg.departure_id}`; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(publicRegistration(reg, actor, userNames, community, names, perms, official)); }
  const membersByCrew = new Map();
  for (const member of memberships) {
    if (!membersByCrew.has(member.crew_id)) membersByCrew.set(member.crew_id, []);
    membersByCrew.get(member.crew_id).push(member.registration_id);
  }
  const crewsByDeparture = new Map();
  for (const crew of crews) {
    const key = `${crew.event_id}:${crew.departure_id}`;
    if (!crewsByDeparture.has(key)) crewsByDeparture.set(key, []);
    crewsByDeparture.get(key).push({
      id:crew.id,
      name:crew.name,
      category:crew.category,
      car:crew.car,
      locked:Boolean(crew.locked),
      version:crew.version,
      registrationIds:membersByCrew.get(crew.id) || [],
      canManage:crew.community_id===community.id ? canManageCrew(crew,actor) : perms.has(crew.community_id) && canManageCrew(crew,{...actor, permissions:perms.get(crew.community_id)}),
      ownedByMe:Boolean(actor.user && crew.owner_user_id===actor.user.id),
      hasOwner:Boolean(crew.owner_user_id),
      ...(crew.community_id!==community.id ? {foreign:true} : {}),
      ...(official.has(crew.event_id) ? {community:names.get(crew.community_id) || null} : {})
    });
  }
  return rows.map(row => {
    const format=row.format||'endurance', capacity=row.capacity==null?null:Number(row.capacity);
    const durationHours=Number(row.duration_hours)||3, durationMinutes=Number(row.duration_minutes)||durationHours*60;
    return {id:row.id, name:row.name, official:row.community_id===OFFICIAL, format, ...(format==='solo' ? {sim:simForEvent(row), details:JSON.parse(row.details||'{}')} : {}), access:row.access||'open', capacity, rounds:JSON.parse(row.rounds||'[]'), circuit:row.circuit||'', durationHours, durationMinutes, driverChangeRequired:row.driver_change_required==null?null:Boolean(row.driver_change_required), eventType:row.event_type||'private', schedulePending:Boolean(row.schedule_pending), createdByMe:Boolean(actor.user && row.created_by===actor.user.id), categories:JSON.parse(row.categories), version:row.version,
      departures:JSON.parse(row.departures).map(d => {
        const availability=grouped.get(`${row.id}:${d.id}`) || [];
        // Solo race: entries keep their order of arrival; beyond the number of places they are on the
        // waiting list, and the first one waiting moves up by itself when someone withdraws.
        if (format==='solo' && capacity) availability.forEach((reg,index)=>{ reg.waitlistPosition=index>=capacity?index-capacity+1:null; });
        // endsAt: the real finish (2 h 30 ends 30 min into the third presence slot).
        return {...d, endsAt:d.startsAt+durationMinutes*60000, availability, crews:crewsByDeparture.get(`${row.id}:${d.id}`) || []};
      })};
  });
}
async function oauthStart(request, env) {
  requireDiscord(env); await rateLimit(request, env, 'oauth', 20); await cleanup(env);
  const state = token();
  await env.DB.prepare('INSERT INTO oauth_states(state_hash,expires_at) VALUES(?,?)').bind(await hash(state), now() + 600).run();
  const auth = new URL('https://discord.com/oauth2/authorize');
  auth.search = new URLSearchParams({client_id:env.DISCORD_CLIENT_ID, response_type:'code', redirect_uri:origin(env) + '/api/auth/discord/callback', scope:'identify', state}).toString();
  // Discord knows one return address (the main one): the page to reopen afterwards, on the community site
  // where the sign-in started, is kept in a cookie shared by the sites of the platform.
  const back = siteOrigin(request, env) + returnPath(new URL(request.url).searchParams.get('return'));
  const names = cookieNames(env);
  return redirect(auth.href, [setCookie(names.state, state, 600, names.domain), setCookie(names.ret, encodeURIComponent(back), 600, names.domain)]);
}
async function oauthCallback(request, env) {
  requireDiscord(env);
  const url = new URL(request.url), state = url.searchParams.get('state');
  const names = cookieNames(env);
  const clear = setCookie(names.state, '', 0, names.domain), clearReturn = setCookie(names.ret, '', 0, names.domain);
  // Back to the page (and community site) the sign-in started from; anything else: the main home page.
  let back = origin(env) + '/';
  try {
    const wanted = new URL(decodeURIComponent(cookie(request, names.ret)));
    if (wanted.origin === origin(env) || communityLabel(wanted, env)) back = wanted.origin + returnPath(wanted.pathname + wanted.hash);
  } catch {}
  const failed = () => redirect(new URL(back).origin + '/?auth=error', [clear, clearReturn]);
  // Why a sign-in fails is written to the Worker logs (never a code, token or secret).
  if (!state || !/^[a-f0-9]{64}$/.test(state) || state !== cookie(request, names.state)) { console.error('Discord sign-in failed: state', state ? (cookie(request, names.state) ? 'mismatch' : 'no browser cookie') : 'missing'); return failed(); }
  const row = await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING state_hash').bind(await hash(state), now()).first();
  if (!row || !url.searchParams.get('code') || url.searchParams.has('error')) { console.error('Discord sign-in failed:', !row ? 'state expired or reused' : url.searchParams.get('error') || 'no code'); return failed(); }
  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID, client_secret:env.DISCORD_CLIENT_SECRET, grant_type:'authorization_code', code:url.searchParams.get('code'), redirect_uri:origin(env) + '/api/auth/discord/callback'}), signal:AbortSignal.timeout(10000)});
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw Error(`token ${response.status} ${String(detail.error || '').slice(0, 40)}`); }
    const auth = await response.json();
    const profileResponse = await fetch('https://discord.com/api/v10/users/@me', {headers:{Authorization:`Bearer ${auth.access_token}`}, signal:AbortSignal.timeout(10000)});
    if (!profileResponse.ok) throw Error(`profile ${profileResponse.status}`);
    const profile = await profileResponse.json();
    if (!/^\d{15,22}$/.test(profile.id)) throw Error('identity');
    const display = String(profile.global_name || profile.username || 'Pilote').slice(0, 32);
    const avatarHash = typeof profile.avatar === 'string' && /^[A-Za-z0-9_]{1,128}$/.test(profile.avatar) ? profile.avatar : '';
    const session = token();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').bind(profile.id, display, now()),
      env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await hash(session), profile.id, now() + 7 * DAY)
    ]);
    const old = cookie(request, names.session);
    if (old) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(old)).run();
    const avatarCookie = avatarHash
      ? `em_discord_avatar=${encodeURIComponent(`${profile.id}:${avatarHash}`)}; Path=/;${names.domain ? ` Domain=${names.domain};` : ''} Secure; SameSite=Lax; Max-Age=${7 * DAY}`
      : `em_discord_avatar=; Path=/;${names.domain ? ` Domain=${names.domain};` : ''} Secure; SameSite=Lax; Max-Age=0`;
    return redirect(back, [clear, clearReturn, setCookie(names.session, session, 7 * DAY, names.domain), avatarCookie]);
  } catch (error) {
    console.error('Discord sign-in failed:', String(error?.message || 'unknown').slice(0, 80));
    return failed();
  }
}
async function api(request, env) {
  if (!env.DB) fail(503, 'La base partagée n’est pas encore configurée.');
  const url = new URL(request.url), path = racesPath(url.pathname), method = request.method;
  // The main address, or a community address of the platform (BASE_DOMAIN).
  const canonical = siteOrigin(request, env);
  if (url.origin !== canonical) fail(403, 'Utilise l’adresse principale du site pour cette action.');
  // The LMU sync program (server/training.mjs): no browser, only the pilot's own key.
  if (path === '/api/training/collector') return trainingCollector(request, env);
  if (path === '/api/training/live') return trainingCollector(request, env, true);
  if (!['GET','HEAD'].includes(method)) {
    if (request.headers.get('Origin') !== canonical) fail(403, 'Origine de la requête refusée.');
    await rateLimit(request, env, 'write', 80);
  }
  if (path === '/api/auth/discord' && method === 'GET') return oauthStart(request, env);
  if (path === '/api/auth/discord/callback' && method === 'GET') return oauthCallback(request, env);
  const actor = await identity(request, env);
  // Every request below works inside one community (separation entry point, server/community.mjs), with
  // the permissions the player's Discord roles give in it (server/access.mjs).
  const community = await currentCommunity(env, request);
  // The main address of the platform (endurance-manager.app) is a showcase: fictional races anyone can look at.
  const openSite = Boolean(baseDomain(env)) && url.hostname === baseDomain(env);
  const access = await communityAccess(env, actor, community, {open:openSite});
  actor.permissions = access.permissions;
  actor.manager = access.manager;
  if (actor.user) actor.user = {...actor.user, role:displayRole(access)};
  const diagnostics = await clientErrorsApi(path,method,env,actor,community);
  if (diagnostics) return diagnostics;
  // Requests for a new community: sent by anyone signed in with Discord, from any site (server/community-requests.mjs).
  const requests = await communityRequestsApi(path, method, request, env, actor);
  if (requests) return requests;
  if (path === '/api/session' && method === 'GET') return json({user:actor.user, discordReady:!!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET), adminConfigured:administrators(env).length > 0, soloRaces:soloRacesEnabled(env, community), soloLabel:eventsLabel(community), training:community.modules?.training === true,
    // Training shows in the bar only for a pilot entered in an upcoming LMU race; the circuit memo always.
    trainingRace:community.modules?.training === true && access.status === 'member' && !!actor.user && !!(await nextRace(env, actor.user.id)),
    community:{id:community.id, slug:community.slug, name:community.name, shortName:community.shortName, discordInviteUrl:community.discordInviteUrl, appearance:appearanceOf(community)},
    access:access.status, permissions:[...access.permissions], manager:access.manager, communities:await myCommunities(env, actor, community), openSite,
    platformDiscordUrl:/^https:\/\/(discord\.gg|discord\.com\/invite)\//.test(env.PLATFORM_DISCORD_URL || '') ? env.PLATFORM_DISCORD_URL : null});
  // The explanation of communities has been read: not shown again, on any device.
  if (path === '/api/me/community-intro' && method === 'POST') {
    if (!actor.user) fail(401, 'Connecte-toi avec Discord.');
    await env.DB.prepare('UPDATE users SET community_intro_seen=1 WHERE id=?').bind(actor.user.id).run();
    return json({ok:true});
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    const names = cookieNames(env), raw = cookie(request, names.session);
    if (raw) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(raw)).run();
    return json({ok:true}, 200, [setCookie(names.session, '', 0, names.domain), `em_discord_avatar=; Path=/;${names.domain ? ` Domain=${names.domain};` : ''} Secure; SameSite=Lax; Max-Age=0`]);
  }
  // Banner of the community: public (shown on the welcome screen too), cached for good (its address changes with it).
  if (path === '/api/community/banner' && method === 'GET') {
    const row = await env.DB.prepare('SELECT image, content_type FROM community_banners WHERE community_id=?').bind(community.id).first();
    if (!row) fail(404, 'Aucune bannière.');
    return new Response(new Uint8Array(row.image), {headers:{'Content-Type':row.content_type, 'Cache-Control':'public, max-age=31536000, immutable', 'X-Content-Type-Options':'nosniff'}});
  }
  // Entries without an account are gone: a community is only open to the members of its Discord server.
  if (path === '/api/guest/recover' || path === '/api/guest/link') fail(410, 'Les inscriptions sans compte Discord ne sont plus possibles.');
  // Everything below needs a member of the community (or a platform manager).
  if (access.status === 'anonymous') fail(401, 'Connecte-toi avec Discord pour accéder à cette communauté.');
  if (access.status !== 'member') fail(403, access.status === 'not-member'
    ? `Cette communauté est réservée aux membres du serveur Discord « ${community.name} ».`
    : 'L’accès à cette communauté ne peut pas être vérifié pour le moment. Réessaie plus tard.');
  // The bell next to the account (server/notifications.mjs).
  const notifications = await notificationsApi(path, method, env, actor, community);
  if (notifications) return notifications;
  // « Mon entraînement » (server/training.mjs).
  const training = await trainingApi(path, method, request, env, actor, community);
  if (training) return training;
  if (path === '/api/events' && method === 'GET') {
    const requestedGame=url.searchParams.get('game');
    const game=requestedGame==='lmu'||requestedGame==='iracing'?requestedGame:'';
    const requestedScope=url.searchParams.get('scope');
    const scope=requestedScope==='upcoming'||requestedScope==='archived'?requestedScope:'';
    const events=await listEvents(env,actor,game,scope,community);
    const payload={events};
    const response=json(payload);
    response.headers.set('X-Endurance-Game',game||'all');
    response.headers.set('X-Endurance-Scope',scope||'all');
    response.headers.set('X-Endurance-Events',String(events.length));
    response.headers.set('X-Endurance-Approx-Bytes',String(new TextEncoder().encode(JSON.stringify(payload)).length));
    return response;
  }
  if (path === '/api/participants' && method === 'GET') {
    if (!actor.user) fail(401,'Connecte-toi avec Discord pour choisir un pilote.');
    // The members of this community only (its Discord server), with their pilot entry here.
    // The main address has no members (anyone signed in only looks): the players with a pilot entry here, never
    // every account of the platform (the other communities' players stay out of sight).
    if (openSite) return json({participants:(await env.DB.prepare(`SELECT u.id,u.name,p.id AS participantId
      FROM participants p JOIN users u ON u.id=p.user_id
      WHERE p.community_id=? AND u.id NOT LIKE 'system:%'
      ORDER BY lower(u.name),u.id`).bind(community.id).all()).results});
    return json({participants:(await env.DB.prepare(`SELECT u.id,u.name,p.id AS participantId
      FROM memberships m JOIN users u ON u.id=m.user_id
      LEFT JOIN participants p ON p.user_id=u.id AND p.community_id=m.community_id
      WHERE m.community_id=? AND m.status='member'
      ORDER BY lower(u.name),u.id`).bind(community.id).all()).results});
  }
  const crewCreate = path.match(/^\/api\/events\/([a-f0-9-]{36})\/departures\/([a-f0-9-]{36})\/crews$/);
  const crewRoute = path.match(/^\/api\/crews\/([a-f0-9-]{36})(?:\/members(?:\/([a-f0-9-]{36}))?)?$/);
  if ((crewCreate && method==='POST') || (crewRoute && ['POST','PATCH','DELETE'].includes(method))) {
    if (!actor.user) fail(401,'Connecte-toi avec Discord pour gérer un équipage.');
    const input=await body(request);
    // A crew of the site's community, or of another of the player's communities on an official race (a new one:
    // the community chosen at its first step). Its community's rights apply.
    const crew=crewRoute ? await env.DB.prepare(`SELECT * FROM crews c WHERE id=? AND (community_id=? OR EXISTS (SELECT 1 FROM events oe WHERE oe.id=c.event_id AND oe.community_id='official'))`).bind(crewRoute[1],community.id).first() : null;
    if (crewRoute && !crew) fail(404,'Équipage introuvable.');
    const event=await eventById(env,crew?.event_id || crewCreate[1],community);
    const {community:here, actor:who} = await actingCommunity(env, actor, community, crew ? crew.community_id : input.communityId, event);
    if ((event.format||'endurance')==='solo') fail(409,'Les événements n’ont pas d’équipage.');
    const departure=departureById(event,crew?.departure_id || crewCreate[2]);
    if (departure.startsAt<=Date.now()) fail(409,'Ce départ est passé. Les équipages sont verrouillés.');
    if (crew && input.version!==crew.version) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
    const membership=crewRoute && path.includes('/members');
    if (membership) {
      if (method==='POST' && !crewRoute[2]) {
        if (crew.locked) fail(409,'Cet équipage est complet. Son responsable doit le rouvrir avant de pouvoir le rejoindre.');
        if (!/^[a-f0-9-]{36}$/.test(input.registrationId || '')) fail(400,'Sélectionne un pilote inscrit.');
        const selected=await env.DB.prepare(registrationSelect+' WHERE r.id=? AND r.community_id=?').bind(input.registrationId,here.id).first();
        if (!selected || selected.event_id!==crew.event_id || selected.departure_id!==crew.departure_id) fail(409,'Ce pilote n’est pas inscrit sur ce départ. Actualise la page.');
        if (selected.category!==crew.category || selected.status==='unavailable') fail(409,'Cette inscription ne correspond pas à la catégorie de l’équipage.');
        const selfJoin=input.selfJoin===true && personal(selected,actor);
        if (!canManageCrew(crew,who) && !selfJoin) fail(403,'Tu peux uniquement rejoindre un équipage avec ta propre inscription.');
        const claimOwner=selfJoin && !crew.owner_user_id ? actor.user.id : null;
        const crewUpdate=claimOwner
          ? env.DB.prepare('UPDATE crews SET version=version+1,owner_user_id=COALESCE(owner_user_id,?) WHERE id=? AND version=?').bind(claimOwner,crew.id,input.version)
          : env.DB.prepare('UPDATE crews SET version=version+1 WHERE id=? AND version=?').bind(crew.id,input.version);
        const results=await env.DB.batch([
          crewUpdate,
          env.DB.prepare('INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE changes()=1').bind(input.registrationId,crew.id),
          env.DB.prepare(`DELETE FROM registrations WHERE changes()=1 AND id!=? AND event_id=? AND departure_id=? AND participant_id=?`).bind(selected.id,selected.event_id,selected.departure_id,selected.participant_id)
        ]);
        if (!results[0].meta.changes) fail(409,'Cet équipage a changé. Actualise la page.');
        const pilot=selected.participant_name||selected.name;
        await notify(env,await crewPilots(env,crew.id),'crew_join',event,{departure,skip:[actor.user.id,selected.participant_user_id],pilot,crewName:crew.name});
        if (!selfJoin && selected.participant_user_id) await notify(env,[{user_id:selected.participant_user_id,community_id:here.id}],'crew_added',event,{departure,skip:[actor.user.id],crewName:crew.name,by:actor.user.name});
        return json({ok:true,removedRegistrations:results[2].meta.changes,claimedOwnership:Boolean(claimOwner)});
      }
      if (method==='DELETE' && crewRoute[2]) {
        const selected=await env.DB.prepare(registrationSelect+' WHERE r.id=? AND r.community_id=?').bind(crewRoute[2],here.id).first();
        if (!selected) fail(404,'Inscription introuvable.');
        const member=await env.DB.prepare('SELECT registration_id FROM crew_members WHERE crew_id=? AND registration_id=?').bind(crew.id,selected.id).first();
        if (!member) fail(409,'Ce pilote ne fait plus partie de cet équipage. Actualise la page.');
        const selfLeave=personal(selected,actor);
        if (!canManageCrew(crew,who) && !selfLeave) fail(403,'Tu peux uniquement quitter toi-même un équipage.');
        let nextOwner=crew.owner_user_id;
        if (crew.owner_user_id && selected.participant_user_id===crew.owner_user_id) {
          const replacement=await env.DB.prepare(`SELECT p.user_id
            FROM crew_members cm
            JOIN registrations r ON r.id=cm.registration_id
            JOIN participants p ON p.id=r.participant_id
            WHERE cm.crew_id=? AND cm.registration_id!=? AND p.user_id IS NOT NULL
            ORDER BY r.created_at,r.id LIMIT 1`).bind(crew.id,selected.id).first();
          nextOwner=replacement?.user_id || null;
        }
        const crewUpdate=Object.prototype.hasOwnProperty.call(crew,'owner_user_id')
          ? env.DB.prepare('UPDATE crews SET version=version+1,locked=0,owner_user_id=? WHERE id=? AND version=?').bind(nextOwner,crew.id,input.version)
          : env.DB.prepare('UPDATE crews SET version=version+1 WHERE id=? AND version=?').bind(crew.id,input.version);
        const results=await env.DB.batch([
          crewUpdate,
          env.DB.prepare('DELETE FROM crew_members WHERE crew_id=? AND registration_id=? AND changes()=1').bind(crew.id,selected.id)
        ]);
        if (!results[0].meta.changes) fail(409,'Cet équipage a changé. Actualise la page.');
        await notify(env,await crewPilots(env,crew.id),'crew_leave',event,{departure,skip:[actor.user.id,selected.participant_user_id],pilot:selected.participant_name||selected.name,crewName:crew.name});
        if (!selfLeave && selected.participant_user_id) await notify(env,[{user_id:selected.participant_user_id,community_id:here.id}],'crew_removed',event,{departure,skip:[actor.user.id],crewName:crew.name,by:actor.user.name});
        return json({ok:true,unlocked:Boolean(crew.locked)});
      }
      fail(404,'Action introuvable.');
    }
    if (crew) {
      if (!canManageCrew(crew,who)) fail(403,'Seul le responsable de cet équipage ou un organisateur peut le modifier.');
      if (method==='DELETE') {
        const told = await crewPilots(env,crew.id);
        const result = await env.DB.prepare('DELETE FROM crews WHERE id=? AND version=?').bind(crew.id,input.version).run();
        if (!result.meta.changes) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
        await notify(env,told,'crew_deleted',event,{departure,skip:[actor.user.id],crewName:crew.name,by:actor.user.name});
        return json({ok:true});
      }
      if (method!=='PATCH') fail(404,'Action introuvable.');
      // Common "Horaire à définir" start: once the official slots are known, the crew picks its start and
      // moves there with its pilots.
      if (input.departureId!==undefined) {
        const target=slotFor(event,departure,input.departureId);
        // One atomic batch: the crew assignment guards forbid moving an assigned entry, so the members leave
        // the crew, their entries and the crew move, then they join it again. Every step checks the crew
        // version, so a crew changed in the meantime is left untouched.
        const members=((await env.DB.prepare('SELECT registration_id FROM crew_members WHERE crew_id=?').bind(crew.id).all()).results||[]).map(row=>row.registration_id);
        const current='EXISTS(SELECT 1 FROM crews WHERE id=? AND version=?)';
        const results=await env.DB.batch([
          env.DB.prepare(`DELETE FROM crew_members WHERE crew_id=? AND ${current}`).bind(crew.id,crew.id,input.version),
          ...members.map(registrationId=>env.DB.prepare(`UPDATE registrations SET departure_id=?,version=version+1 WHERE id=? AND ${current}`).bind(target.id,registrationId,crew.id,input.version)),
          env.DB.prepare('UPDATE crews SET departure_id=?,version=version+1 WHERE id=? AND version=?').bind(target.id,crew.id,input.version),
          ...members.map(registrationId=>env.DB.prepare('INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM crews WHERE id=? AND version=? AND departure_id=?)').bind(registrationId,crew.id,crew.id,input.version+1,target.id))
        ]);
        if (!results[1+members.length].meta.changes) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
        await notify(env,await crewPilots(env,crew.id),'crew_start',event,{departure:target,skip:[actor.user.id],crewName:crew.name,by:actor.user.name});
        return json({ok:true,departureId:target.id});
      }
      if (typeof input.locked==='boolean' && input.name===undefined && input.category===undefined && input.car===undefined) {
        const result=await env.DB.prepare('UPDATE crews SET locked=?,version=version+1 WHERE id=? AND version=?').bind(input.locked?1:0,crew.id,input.version).run();
        if (!result.meta.changes) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
        return json({ok:true,locked:input.locked});
      }
      const name=text(input.name,60,'Nom de l’équipage');
      if (!JSON.parse(event.categories).includes(input.category)) fail(400,'Choisis une catégorie de cet événement.');
      const car=crewCar(input);
      const result=await env.DB.prepare('UPDATE crews SET name=?,category=?,car=?,version=version+1 WHERE id=? AND version=?').bind(name,input.category,car,crew.id,input.version).run();
      if (!result.meta.changes) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
      // A new car: the crew's pilots are told (not a change of name or category alone).
      if ((crew.car||'')!==(car||'')) await notify(env,await crewPilots(env,crew.id),'crew_car',event,{departure,skip:[actor.user.id],crewName:name,car:car||'',by:actor.user.name});
      return json({id:crew.id});
    }
    const name=text(input.name,60,'Nom de l’équipage');
    if (!JSON.parse(event.categories).includes(input.category)) fail(400,'Choisis une catégorie de cet événement.');
    const car=crewCar(input);
    const crewId=id();
    if (can(who,'manage_registrations')) {
      const result=await env.DB.prepare('INSERT INTO crews(id,event_id,departure_id,name,category,car,created_at,community_id) VALUES(?,?,?,?,?,?,?,?)').bind(crewId,event.id,departure.id,name,input.category,car,now(),here.id).run();
      if (!result.meta.changes) fail(409,'Impossible de créer cet équipage. Actualise avant de réessayer.');
      return json({id:crewId,joined:false},201);
    }
    requirePermission(who,'endurance','Tu n’as pas l’autorisation de créer un équipage dans cette communauté.');
    const ownRows=(await env.DB.prepare(registrationSelect+' WHERE r.event_id=? AND r.departure_id=? AND r.category=? AND r.status!=? AND r.community_id=?').bind(event.id,departure.id,input.category,'unavailable',here.id).all()).results;
    const selected=ownRows.find(reg=>personal(reg,actor));
    if (!selected) fail(403,'Inscris-toi d’abord sur ce départ dans cette catégorie avant de créer ton équipage.');
    const results=await env.DB.batch([
      env.DB.prepare('INSERT INTO crews(id,event_id,departure_id,name,category,car,owner_user_id,created_at,community_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(crewId,event.id,departure.id,name,input.category,car,actor.user.id,now(),here.id),
      env.DB.prepare('INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE changes()=1').bind(selected.id,crewId),
      env.DB.prepare(`DELETE FROM registrations WHERE changes()=1 AND id!=? AND event_id=? AND departure_id=? AND participant_id=?`).bind(selected.id,selected.event_id,selected.departure_id,selected.participant_id)
    ]);
    if (!results[0].meta.changes) fail(409,'Impossible de créer cet équipage. Actualise avant de réessayer.');
    return json({id:crewId,joined:true,removedRegistrations:results[2].meta.changes},201);
  }
  if (path === '/api/events' && method === 'POST') {
    requirePermission(actor,'create_race','Tu n’as pas l’autorisation de créer une course dans cette communauté.');
    const input = await body(request);
    if (input.format === 'solo' && !soloRacesEnabled(env, community)) fail(400, 'Les événements ne sont pas activés sur ce site.');
    const data = validateEvent(input), eventId = id();
    // « Course officielle (toutes les communautés) »: the platform managers only.
    if (input.official === true && !actor.manager) fail(403, 'Seuls les gestionnaires de la plateforme créent des courses officielles.');
    const owner = input.official === true ? OFFICIAL : community.id;
    await dropEmptyCommonStart(env, null, data);
    await env.DB.prepare('INSERT INTO events(id,name,duration_hours,duration_minutes,event_type,circuit,schedule_pending,driver_change_required,format,access,capacity,rounds,categories,departures,created_by,created_at,community_id,sim,details) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(eventId, data.name, data.durationHours, data.durationMinutes, data.eventType, data.circuit, data.schedulePending?1:0, data.driverChangeRequired==null?null:(data.driverChangeRequired?1:0), data.format, data.access, data.capacity, JSON.stringify(data.rounds), JSON.stringify(data.categories), JSON.stringify(data.departures), actor.user.id, now(), owner, data.sim, JSON.stringify(data.details)).run();
    return json({id:eventId}, 201);
  }
  // « Rendre officielle »: a race of the community becomes common to every community (managers); its entries and
  // crews stay in their community.
  const officialMatch = path.match(/^\/api\/events\/([a-f0-9-]{36})\/official$/);
  if (officialMatch && method === 'POST') {
    if (!actor.manager) fail(403, 'Seuls les gestionnaires de la plateforme rendent une course officielle.');
    const event = await eventById(env, officialMatch[1], community);
    if (event.community_id === OFFICIAL) return json({ok:true});
    if ((event.format || 'endurance') === 'solo') fail(400, 'Un événement reste dans sa communauté.');
    await env.DB.prepare('UPDATE events SET community_id=?,version=version+1 WHERE id=? AND community_id=?').bind(OFFICIAL, event.id, community.id).run();
    return json({ok:true});
  }
  const eventMatch = path.match(/^\/api\/events\/([a-f0-9-]{36})$/);
  if (eventMatch && ['PATCH','DELETE'].includes(method)) {
    const event = await eventById(env, eventMatch[1], community), input = await body(request);
    if (event.community_id === OFFICIAL && !actor.manager) fail(403, 'Une course officielle se modifie par les gestionnaires de la plateforme.');
    // Every race with "Gérer toutes les courses"; one's own races with "Créer une course".
    if (!can(actor,'manage_races') && !(can(actor,'create_race') && event.created_by === actor.user?.id)) requirePermission(actor,'manage_races','Tu n’as pas l’autorisation de modifier cette course.');
    if (input.version !== event.version) fail(409, 'Cet événement a changé. Actualise avant de réessayer.');
    if (method === 'DELETE') {
      const told = await eventPilots(env, event.id);
      const result = await env.DB.prepare('DELETE FROM events WHERE id=? AND version=?').bind(event.id, input.version).run();
      if (!result.meta.changes) fail(409, 'Cet événement a changé. Actualise avant de réessayer.');
      await notify(env, told, 'race_deleted', event, {skip:[actor.user?.id]});
      return json({ok:true});
    }
    const data = validateEvent(input, event);
    await dropEmptyCommonStart(env, event.id, data);
    const cats = JSON.stringify(data.categories), deps = JSON.stringify(data.departures);
    const result = await env.DB.prepare(`UPDATE events SET name=?,duration_hours=?,duration_minutes=?,event_type=?,circuit=?,schedule_pending=?,driver_change_required=?,access=?,capacity=?,rounds=?,categories=?,departures=?,sim=?,details=?,version=version+1 WHERE id=? AND version=?
      AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.event_id=events.id AND
        (NOT EXISTS (SELECT 1 FROM json_each(?) d WHERE json_extract(d.value,'$.id')=r.departure_id)
      OR (r.category NOT IN ('','*') AND NOT EXISTS (SELECT 1 FROM json_each(?) c WHERE c.value=r.category))
      OR EXISTS (SELECT 1 FROM json_each(?) h WHERE instr(',' || r.status || ',', ',' || h.value || ',') > 0)))`).bind(data.name, data.durationHours, data.durationMinutes, data.eventType, data.circuit, data.schedulePending?1:0, data.driverChangeRequired==null?null:(data.driverChangeRequired?1:0), data.access, data.capacity, JSON.stringify(data.rounds), cats, deps, data.sim, JSON.stringify(data.details), event.id, input.version, deps, cats, JSON.stringify(Array.from({length:24-data.durationHours},(_,i)=>`h${data.durationHours+i+1}`))).run();
    if (!result.meta.changes) fail(409, 'Modification impossible : événement modifié ailleurs, départ supprimé avec des inscrits, catégorie encore utilisée, ou disponibilités au-delà de la nouvelle durée. Ajuste les disponibilités concernées avant de raccourcir la course.');
    // The entered pilots are told what changed for them: the starts, the track, the length or the name.
    const starts = list => JSON.stringify(JSON.parse(list).map(d => [d.id, d.startsAt, Boolean(d.tbd)]));
    const changes = [starts(event.departures) !== starts(deps) && 'starts', (event.circuit || '') !== data.circuit && 'circuit',
      (Number(event.duration_minutes) || Number(event.duration_hours) * 60) !== data.durationMinutes && 'duration', event.name !== data.name && 'name'].filter(Boolean);
    if (changes.length) await notify(env, await eventPilots(env, event.id), 'race_changed', {...event, name:data.name, circuit:data.circuit}, {skip:[actor.user?.id], changes, previousName:event.name !== data.name ? event.name : undefined});
    return json({ok:true});
  }
  const departureMatch = path.match(/^\/api\/events\/([a-f0-9-]{36})\/departures\/([a-f0-9-]{36})\/registrations$/);
  if (departureMatch && method === 'POST') {
    const event = await eventById(env, departureMatch[1], community);
    const departure = departureById(event, departureMatch[2]);
    if (departure.startsAt <= Date.now()) fail(409, 'Ce départ est passé. Les inscriptions sont fermées.');
    const input = await body(request);
    // Official race: an own entry is made for the community chosen at its first step (another pilot: the site's).
    if (input.communityId && input.communityId !== community.id && (input.forOther === true || input.participantUserId || input.participantId)) fail(400, 'Un autre pilote s’inscrit dans la communauté du site.');
    const {community:here, actor:who} = await actingCommunity(env, actor, community, input.communityId, event);
    const solo = (event.format||'endurance') === 'solo';
    // Own entry: "S'inscrire". Someone else's (Discord pilot or typed name): "Inscrire un autre pilote".
    const forOther = input.forOther === true || Boolean(input.participantUserId);
    if (forOther) requirePermission(who,'manage_registrations','Tu n’as pas l’autorisation d’inscrire un autre pilote dans cette communauté.');
    // Solo races: OPEN for "Courses solo OPEN" or "SAFE", SAFE only for "SAFE". Endurances: "Endurances".
    else if (solo && event.access === 'safe') requirePermission(who,'solo_safe','Cet événement est réservé aux pilotes SAFE. Demande à un administrateur du Discord.');
    else if (solo) { if (!can(who,'solo_safe')) requirePermission(who,'solo_open','Tu n’as pas l’autorisation de t’inscrire aux événements de cette communauté.'); }
    else requirePermission(who,'endurance','Tu n’as pas l’autorisation de t’inscrire aux endurances de cette communauté.');
    const data = validateRegistration(input, event);
    const participant=await registrationParticipant(env,who,input,data,here);
    if (solo && await env.DB.prepare('SELECT 1 FROM registrations WHERE event_id=? AND departure_id=? AND participant_id=? LIMIT 1').bind(event.id,departure.id,participant.id).first()) fail(409, 'Ce pilote est déjà inscrit à cette course. Modifie son inscription.');
    const userId=participant.user_id;
    // Official race: a Discord account enters a start once, whatever the community.
    if (userId && event.community_id === OFFICIAL && await env.DB.prepare('SELECT 1 FROM registrations WHERE event_id=? AND departure_id=? AND user_id=? AND community_id<>? LIMIT 1').bind(event.id, departure.id, userId, here.id).first())
      fail(409, forOther ? 'Ce pilote est déjà inscrit à ce départ avec une autre de ses communautés.' : 'Tu es déjà inscrit à ce départ avec une autre de tes communautés : modifie ton inscription depuis son site.');
    const guestHash=userId?null:participant.guest_hash||await hash(token());
    const ownerUserId = actor.user?.id || null;
    const regId = id();
    if (input.participantId) { data.name=participant.name;data.nameKey=data.name.normalize('NFKC').toLocaleLowerCase('fr-FR'); }
    // Another category on a start the pilot is already entered on: the others were told the first time.
    const alreadyThere=Boolean(await env.DB.prepare('SELECT 1 FROM registrations WHERE event_id=? AND departure_id=? AND participant_id=? LIMIT 1').bind(event.id,departure.id,participant.id).first());
    const result = await env.DB.prepare(`INSERT INTO registrations(id,event_id,departure_id,user_id,owner_user_id,guest_hash,name,name_key,category,car,car_preferences,car_any,status,preferred_pilot,created_at,participant_id,round_choices,solo_driver,community_id)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM events WHERE id=? AND version=? AND (community_id=? OR community_id=?)`).bind(regId,event.id,departure.id,userId,ownerUserId,guestHash,data.name,data.nameKey,data.category,data.car,JSON.stringify(data.cars),data.carAny?1:0,data.status,data.preferredPilot,now(),participant.id,JSON.stringify(data.roundChoices||[]),data.soloDriver?1:0,here.id,event.id,event.version,community.id,OFFICIAL).run();
    if (!result.meta.changes) fail(409, 'Cet événement a changé. Actualise avant de t’inscrire.');
    if (!alreadyThere && data.status!=='unavailable') await notify(env,await departurePilots(env,event.id,departure.id,here.id),'entry',event,{departure,skip:[actor.user?.id,userId],pilot:data.name,category:data.category});
    if (forOther && userId && userId!==actor.user?.id) await notify(env,[{user_id:userId,community_id:here.id}],'entered_by',event,{departure,by:actor.user.name,category:data.category});
    return json({id:regId}, 201);
  }
  // A pilot without a crew on the common "Horaire à définir" start picks one of the official slots.
  const regMove = path.match(/^\/api\/registrations\/([a-f0-9-]{36})\/departure$/);
  if (regMove && method === 'PATCH') {
    // An entry of the site's community, or of another of the player's communities on an official race.
    const reg = await env.DB.prepare(registrationSelect+` WHERE r.id=? AND (r.community_id=? OR EXISTS (SELECT 1 FROM events oe WHERE oe.id=r.event_id AND oe.community_id='official'))`).bind(regMove[1],community.id).first();
    if (!reg) fail(404, 'Inscription introuvable.');
    const {actor:who} = await actingCommunity(env, actor, community, reg.community_id);
    if (!canManageRegistration(reg,who)) fail(403, 'Tu n’as pas l’autorisation de modifier cette inscription.');
    const input = await body(request);
    if (input.version !== reg.version) fail(409, 'Cette inscription a changé. Actualise la page.');
    const event = await eventById(env, reg.event_id, community), target = slotFor(event, departureById(event, reg.departure_id), input.departureId);
    const result = await env.DB.prepare(`UPDATE registrations SET departure_id=?,version=version+1 WHERE id=? AND version=?
      AND NOT EXISTS(SELECT 1 FROM crew_members WHERE registration_id=?)`).bind(target.id, reg.id, input.version, reg.id).run();
    if (!result.meta.changes) fail(409, 'Rejoins ou quitte d’abord ton équipage : c’est lui qui choisit le départ.');
    return json({ok:true, departureId:target.id});
  }
  const regMatch = path.match(/^\/api\/registrations\/([a-f0-9-]{36})$/);
  if (regMatch && ['PATCH','DELETE'].includes(method)) {
    const reg = await env.DB.prepare(registrationSelect+` WHERE r.id=? AND (r.community_id=? OR EXISTS (SELECT 1 FROM events oe WHERE oe.id=r.event_id AND oe.community_id='official'))`).bind(regMatch[1],community.id).first();
    if (!reg) fail(404, 'Inscription introuvable.');
    const {actor:who} = await actingCommunity(env, actor, community, reg.community_id);
    if (!canManageRegistration(reg,who)) fail(403, 'Tu n’as pas l’autorisation de modifier cette inscription.');
    const event = await eventById(env, reg.event_id, community), departure = departureById(event,reg.departure_id);
    if (departure.startsAt <= Date.now()) fail(409, 'Ce départ est passé. Les inscriptions sont verrouillées.');
    const input = await body(request);
    if (input.version !== reg.version) fail(409, 'Cette inscription a changé. Actualise la page.');
    let result;
    // A pilot leaving the race: his crew is told (and he is, when someone else takes him off).
    const crewOfEntry = method === 'DELETE' ? await env.DB.prepare('SELECT c.id,c.name FROM crew_members cm JOIN crews c ON c.id=cm.crew_id WHERE cm.registration_id=?').bind(reg.id).first() : null;
    if (method === 'DELETE') result = await env.DB.prepare('DELETE FROM registrations WHERE id=? AND version=?').bind(reg.id,input.version).run();
    else {
      const data = validateRegistration(input,event);
      // A pilot linked to Discord keeps his Discord name: an edit cannot show him as another member.
      if (reg.participant_user_id) {
        data.name=(await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(reg.participant_user_id).first())?.name || reg.participant_name || data.name;
        data.nameKey=data.name.normalize('NFKC').toLocaleLowerCase('fr-FR');
      }
      const results=await env.DB.batch([
        env.DB.prepare(`UPDATE registrations SET name=?,name_key=?,category=?,car=?,car_preferences=?,car_any=?,status=?,preferred_pilot=?,round_choices=?,solo_driver=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM events WHERE id=? AND version=?)`).bind(data.name,data.nameKey,data.category,data.car,JSON.stringify(data.cars),data.carAny?1:0,data.status,data.preferredPilot,JSON.stringify(data.roundChoices||[]),data.soloDriver?1:0,reg.id,input.version,event.id,event.version),
        env.DB.prepare('UPDATE participants SET name=? WHERE id=? AND changes()=1').bind(data.name,reg.participant_id)
      ]);
      result=results[0];
    }
    if (!result.meta.changes) fail(409, 'Les données ont changé. Actualise avant de réessayer.');
    if (method === 'DELETE') {
      const pilot = reg.participant_name || reg.name;
      if (crewOfEntry) await notify(env,await crewPilots(env,crewOfEntry.id),'withdrawn',event,{departure,skip:[actor.user?.id,reg.participant_user_id],pilot,crewName:crewOfEntry.name});
      if (reg.participant_user_id && reg.participant_user_id !== actor.user?.id) await notify(env,[{user_id:reg.participant_user_id,community_id:reg.community_id}],'removed_by',event,{departure,by:actor.user?.name||'',category:reg.category});
    }
    return json({ok:true});
  }
  // Admins can run the daily import of official iRacing endurances at once.
  if (path === '/api/admin/iracing-import' && method === 'POST') {
    requirePermission(actor,'admin');
    // Manual update from the iRacing space (admins), e.g. to repair after a change of the schedule data.
    try { return json(await syncIracingEvents(env)); }
    catch (error) { fail(502, 'Le calendrier iRacing est momentanément indisponible. Réessaie plus tard.'); }
  }
  // Members of the community: the players found on its Discord server, with their Discord roles and what
  // these roles allow here. Roles and access are managed on Discord; the role settings page comes with step 4.
  if (path === '/api/members/refresh' && method === 'POST') {
    requirePermission(actor,'admin');
    return json({ok:true, checked:await refreshCommunityMembers(env, community)});
  }
  if (path === '/api/members' && method === 'GET') {
    requirePermission(actor,'admin');
    const rows = (await env.DB.prepare(`SELECT m.*, u.name FROM memberships m JOIN users u ON u.id=m.user_id
      WHERE m.community_id=? AND m.status='member' ORDER BY lower(u.name) LIMIT 500`).bind(community.id).all()).results || [];
    const discord = community.discordGuildId ? await discordGuild(env, community.discordGuildId) : null;
    const roleNames = new Map((discord?.roles || []).map(role => [role.id, role.name]));
    const members = [];
    for (const row of rows) members.push({id:row.user_id, name:row.name, nickname:row.nickname, discordAdmin:Boolean(row.discord_admin),
      manager:administrators(env).includes(row.user_id),
      roles:JSON.parse(row.discord_roles || '[]').map(roleId => ({id:roleId, name:roleNames.get(roleId) || roleId})),
      permissions:[...await memberPermissions(env, community, row)], checkedAt:row.checked_at});
    return json({community:{name:community.name, discordServer:discord?.name || null}, members, permissions:PERMISSIONS});
  }
  // Community settings (admins): what each Discord role allows, and the enabled modules.
  if (path === '/api/community/settings' && method === 'GET') {
    requirePermission(actor,'admin');
    const discord = community.discordGuildId ? await discordGuild(env, community.discordGuildId) : null;
    const rows = (await env.DB.prepare('SELECT discord_role_id, permissions FROM community_role_permissions WHERE community_id=?').bind(community.id).all()).results || [];
    const saved = new Map(rows.map(row => [row.discord_role_id, JSON.parse(row.permissions || '[]')]));
    const roles = (discord?.roles || []).sort((a, b) => b.position - a.position).map(role => ({id:role.id, name:role.id === community.discordGuildId ? '@everyone' : role.name,
      administrator:role.administrator, permissions:saved.has(role.id) ? normalizePermissions(saved.get(role.id)) : (role.id === community.discordGuildId ? [...DEFAULT_EVERYONE] : [])}));
    await keepDiscordLook(env, community, discord);
    return json({community:{name:community.name, shortName:community.shortName, discordServer:discord?.name || null, ...appearanceOf(community)}, roles, permissions:PERMISSIONS,
      modules:{iracingImport:community.modules.iracingImport === true, discordWeekly:community.modules.discordWeekly === true, soloRaces:community.modules.soloRaces === true, eventsLabel:eventsLabel(community),
        crewChannels:community.modules.crewChannels === true, raceReminders:community.modules.raceReminders === true, training:community.modules.training === true},
      crews:await crewDiscordState(env, community)});
  }
  // Banner sent by the admins: the image itself (already resized by the browser), WebP, JPEG or PNG, 600 KB at most.
  if (path === '/api/community/banner' && ['PUT','DELETE'].includes(method)) {
    requirePermission(actor,'admin');
    const appearance = {...community.appearance};
    if (method === 'DELETE') {
      delete appearance.bannerVersion;
      await env.DB.batch([env.DB.prepare('DELETE FROM community_banners WHERE community_id=?').bind(community.id),
        env.DB.prepare('UPDATE communities SET appearance=? WHERE id=?').bind(JSON.stringify(appearance), community.id)]);
      return json({ok:true});
    }
    const image = await imageBody(request, 600000);
    const type = imageType(image);
    if (!type) fail(400, 'Envoie une image WebP, JPEG ou PNG.');
    appearance.bannerVersion = now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO community_banners(community_id,image,content_type,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(community_id) DO UPDATE SET image=excluded.image,content_type=excluded.content_type,updated_at=excluded.updated_at`).bind(community.id, image, type, now()),
      env.DB.prepare('UPDATE communities SET appearance=? WHERE id=?').bind(JSON.stringify(appearance), community.id)]);
    return json({ok:true, bannerUrl:`/api/community/banner?v=${appearance.bannerVersion}`});
  }
  if (path === '/api/community/appearance' && method === 'PATCH') {
    requirePermission(actor,'admin');
    const input = await body(request);
    const name = text(input.name, 80, 'Nom de la communauté'), shortName = text(input.shortName, 12, 'Nom court');
    if (input.accent !== null && !/^#[0-9a-f]{6}$/i.test(input.accent || '')) fail(400, 'Choisis une couleur valide.');
    const appearance = {...community.appearance, accent:input.accent || null};
    await env.DB.prepare('UPDATE communities SET name=?, short_name=?, appearance=? WHERE id=?').bind(name, shortName, JSON.stringify(appearance), community.id).run();
    return json({ok:true});
  }
  const roleSetting = path.match(/^\/api\/community\/roles\/(\d{15,22})$/);
  if (roleSetting && method === 'PUT') {
    requirePermission(actor,'admin');
    const input = await body(request);
    const discord = community.discordGuildId ? await discordGuild(env, community.discordGuildId) : null;
    if (!discord?.roles.some(role => role.id === roleSetting[1])) fail(404, 'Ce rôle n’existe pas sur le serveur Discord de la communauté.');
    if (!Array.isArray(input.permissions) || input.permissions.some(permission => !PERMISSIONS.includes(permission))) fail(400, 'Autorisations invalides.');
    await env.DB.prepare(`INSERT INTO community_role_permissions(community_id,discord_role_id,permissions,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(community_id,discord_role_id) DO UPDATE SET permissions=excluded.permissions,updated_at=excluded.updated_at`)
      .bind(community.id, roleSetting[1], JSON.stringify([...new Set(input.permissions)]), now()).run();
    return json({ok:true});
  }
  if (path === '/api/community/modules' && method === 'PATCH') {
    requirePermission(actor,'admin');
    const input = await body(request);
    const modules = {...community.modules};
    // The Discord recap is set on the « Mise en place » page (its own webhook), not here.
    for (const key of ['iracingImport','soloRaces','raceReminders','training']) if (typeof input[key] === 'boolean') modules[key] = input[key];
    if (typeof input.eventsLabel === 'string') { const label = input.eventsLabel.trim(); if (label.length > 20) fail(400, 'Le nom de l’onglet fait au plus 20 caractères.'); if (label) modules.eventsLabel = label; else delete modules.eventsLabel; }
    const statements = [];
    // Crews on Discord (server/crew-discord.mjs): only once the bot has the rights to make the channels.
    if (typeof input.crewChannels === 'boolean') {
      if (input.crewChannels && await botCanManageChannels(env, community.discordGuildId) !== true)
        fail(400, 'Le bot n’a pas encore les droits pour créer les salons : clique sur « Donner les droits au bot », puis réessaie.');
      modules.crewChannels = input.crewChannels;
      if (input.crewChannels) statements.push(env.DB.prepare(`INSERT INTO community_crew_discord(community_id,updated_at) VALUES(?,?)
        ON CONFLICT(community_id) DO UPDATE SET last_error=NULL,last_error_at=NULL,updated_at=excluded.updated_at`).bind(community.id, now()));
    }
    statements.push(env.DB.prepare('UPDATE communities SET modules=? WHERE id=?').bind(JSON.stringify(modules), community.id));
    await env.DB.batch(statements);
    return json({ok:true, modules});
  }
  // « Mise en place » (admins): where the community stands, step by step (members page).
  if (path === '/api/community/setup' && method === 'GET') {
    requirePermission(actor,'admin');
    const discord = community.discordGuildId ? await discordGuild(env, community.discordGuildId) : null;
    const recaps = ((await env.DB.prepare('SELECT scope, webhook_url, updated_at FROM community_recaps WHERE community_id=? ORDER BY scope').bind(community.id).all()).results || [])
      .map(row => ({scope:row.scope, webhook:maskWebhook(row.webhook_url), updatedAt:row.updated_at}));
    const rolesConfigured = Boolean(await env.DB.prepare('SELECT 1 FROM community_role_permissions WHERE community_id=? LIMIT 1').bind(community.id).first());
    return json({community:{name:community.name, slug:community.slug}, siteUrl:communityUrl(env, community), rolesConfigured, recaps,
      // Former recap (site's webhook, LMU only) still running until the admins choose their own.
      legacyRecap:!recaps.length && usesSiteRecap(env, community),
      guild:{id:community.discordGuildId, name:discord?.name || null, botPresent:Boolean(discord)}, botInviteUrl:botInvite(env, community.discordGuildId),
      discordInviteUrl:community.discordInviteUrl});
  }
  // The recap messages of the community: one message (one simulator or both) or two (one per simulator,
  // e.g. in two channels). An empty address keeps the webhook already saved for that message.
  if (path === '/api/community/recaps' && method === 'PUT') {
    requirePermission(actor,'admin');
    const input = await body(request);
    const list = Array.isArray(input.recaps) ? input.recaps : [];
    const scopes = list.map(item => item?.scope);
    const valid = !scopes.length || (scopes.length === 1 && RECAP_SCOPES.includes(scopes[0])) || (scopes.length === 2 && scopes.includes('lmu') && scopes.includes('iracing'));
    if (!valid) fail(400, 'Choisis un message (une simu ou les deux) ou deux messages (un par simu).');
    const saved = new Map(((await env.DB.prepare('SELECT scope, webhook_url FROM community_recaps WHERE community_id=?').bind(community.id).all()).results || []).map(row => [row.scope, row.webhook_url]));
    const rows = list.map(item => {
      const url = String(item.webhookUrl || '').trim() || saved.get(item.scope) || '';
      if (!WEBHOOK_URL.test(url)) fail(400, `Colle l’adresse du webhook Discord pour le message ${RECAP_NAMES[item.scope]}. Elle commence par https://discord.com/api/webhooks/.`);
      return {scope:item.scope, url};
    });
    const modules = {...community.modules, discordWeekly:rows.length > 0};
    await env.DB.batch([
      env.DB.prepare('DELETE FROM community_recaps WHERE community_id=?').bind(community.id),
      ...rows.map(row => env.DB.prepare('INSERT INTO community_recaps(community_id,scope,webhook_url,updated_at) VALUES(?,?,?,?)').bind(community.id, row.scope, row.url, now())),
      // New settings: new messages (those already posted stay where they are).
      env.DB.prepare('DELETE FROM discord_weekly_state WHERE community_id=?').bind(community.id),
      env.DB.prepare('UPDATE communities SET modules=? WHERE id=?').bind(JSON.stringify(modules), community.id)]);
    const published = rows.length ? await syncWeeklyDiscord(env, Date.now(), {...community, modules}) : {ok:true};
    return json({ok:true, published:published.ok !== false});
  }
  if (path === '/api/community/recaps/test' && method === 'POST') {
    requirePermission(actor,'admin');
    await rateLimit(request, env, 'recap-test', 10);
    const input = await body(request);
    const url = String(input.webhookUrl || '').trim() || (await env.DB.prepare('SELECT webhook_url FROM community_recaps WHERE community_id=? AND scope=?').bind(community.id, String(input.scope || '')).first())?.webhook_url || '';
    try { await sendRecapTest(url, community); }
    catch (error) {
      if (error.status === 400) fail(400, 'Cette adresse n’est pas un webhook Discord. Elle commence par https://discord.com/api/webhooks/.');
      fail(400, 'Discord refuse ce webhook : il a peut-être été supprimé. Crée-en un nouveau dans les paramètres du salon.');
    }
    return json({ok:true});
  }
  // Invitation to the community's Discord server, shown to the players who are not members yet.
  if (path === '/api/community/invite' && method === 'PATCH') {
    requirePermission(actor,'admin');
    const input = await body(request);
    const url = input.url == null || input.url === '' ? null : String(input.url).trim();
    if (url && !/^https:\/\/(?:discord\.gg|discord\.com\/invite)\/[\w-]{2,64}$/.test(url)) fail(400, 'Colle un lien d’invitation Discord (https://discord.gg/…).');
    await env.DB.prepare('UPDATE communities SET discord_invite_url=? WHERE id=?').bind(url, community.id).run();
    return json({ok:true});
  }
  // Platform managers: the communities, and a new one (its admins then set it up on its « Mise en place » page).
  // Showcase of the main address: its data replaced by fictional races, crews and pilots (server/demo.mjs).
  if (path === '/api/platform/showcase' && method === 'POST') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    if (!openSite) fail(400, 'La vitrine se réinitialise depuis l’adresse principale du site.');
    const input = await body(request);
    if (input.confirm !== 'VITRINE') fail(400, 'Tape VITRINE pour confirmer.');
    const result = await resetShowcase(env, community);
    // The official iRacing calendar comes back with the next scheduled import (within 15 minutes).
    return json({ok:true, ...result});
  }
  // A community with no race and no pilot yet (made by mistake): its settings and members go with it. Never the
  // community of the main address.
  const platformCommunity = path.match(/^\/api\/platform\/communities\/([a-z0-9-]{3,40})$/);
  if (platformCommunity && method === 'DELETE') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    const row = await env.DB.prepare('SELECT id, slug FROM communities WHERE slug=?').bind(platformCommunity[1]).first();
    if (!row) fail(404, 'Communauté introuvable.');
    if (row.slug === communitySlug(env, null)) fail(400, 'La communauté de l’adresse principale ne se supprime pas.');
    const used = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM events WHERE community_id=?) + (SELECT COUNT(*) FROM participants WHERE community_id=?) AS n').bind(row.id, row.id).first();
    if (Number(used?.n) > 0) fail(409, 'Cette communauté a déjà des courses ou des pilotes : elle ne peut pas être supprimée.');
    await env.DB.batch([...['iracing_imports', 'memberships', 'community_role_permissions', 'community_recaps', 'discord_weekly_state', 'community_banners']
      .map(table => env.DB.prepare(`DELETE FROM ${table} WHERE community_id=?`).bind(row.id)), env.DB.prepare('DELETE FROM communities WHERE id=?').bind(row.id)]);
    return json({ok:true});
  }
  if (path === '/api/platform/communities' && method === 'GET') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    const list = [];
    for (const item of await allCommunities(env)) {
      const discord = item.discordGuildId ? await discordGuild(env, item.discordGuildId) : null;
      list.push({slug:item.slug, name:item.name, url:communityUrl(env, item), guildId:item.discordGuildId, discordServer:discord?.name || null, botPresent:Boolean(discord), botInviteUrl:botInvite(env, item.discordGuildId)});
    }
    return json({communities:list, baseDomain:baseDomain(env) || null, showcase:openSite, testSite:isDevelopment(env)});
  }
  if (path === '/api/platform/communities' && method === 'POST') {
    if (!actor.manager) fail(403, 'Réservé aux gestionnaires de la plateforme.');
    // The test site has its own database: a community made there could never be reached at its address.
    if (isDevelopment(env)) fail(403, 'Ce site est la version de test : une communauté créée ici n’est pas accessible. Crée-la depuis endurance-manager.app.');
    const input = await body(request);
    const name = text(input.name, 80, 'Nom de la communauté'), shortName = text(input.shortName, 12, 'Nom court');
    const slug = String(input.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) fail(400, 'L’adresse : 3 à 40 caractères, lettres minuscules, chiffres et tirets (pas au début ni à la fin).');
    const guildId = String(input.guildId || '').trim();
    if (!/^\d{15,22}$/.test(guildId)) fail(400, 'L’ID du serveur Discord : un nombre de 17 à 20 chiffres (clic droit sur le serveur → Copier l’identifiant du serveur).');
    if (await env.DB.prepare('SELECT 1 FROM communities WHERE discord_guild_id=?').bind(guildId).first()) fail(409, 'Ce serveur Discord est déjà relié à une communauté.');
    try {
      await env.DB.prepare('INSERT INTO communities(id,slug,name,short_name,discord_guild_id,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), slug, name, shortName, guildId, now()).run();
    } catch (error) {
      if (/UNIQUE|CHECK|constraint/i.test(String(error?.message))) fail(409, 'Cette adresse est déjà prise ou réservée : choisis-en une autre.');
      throw error;
    }
    // Created from a request of the page « Demander un espace »: that request is done.
    await closeCommunityRequest(env, input.requestId);
    const created = {slug};
    return json({ok:true, url:communityUrl(env, created), botInviteUrl:botInvite(env, guildId)}, 201);
  }
  if (path.startsWith('/api/members/')) fail(410, 'Les rôles se gèrent maintenant sur le serveur Discord de la communauté.');
  fail(404, 'Action introuvable.');
}
// An address that leads nowhere (old link, typo): a page saying so, with the way back, instead of a blank page.
function pageNotFound() {
  const page = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page introuvable · ENDURANCE MANAGER</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d0f;color:#e6ecea;font-family:system-ui,sans-serif;text-align:center;padding:24px}main{max-width:520px}h1{font-size:28px;margin:0 0 12px}p{color:#c7d0d4;line-height:1.6}a{color:#5fd3dc}</style></head>
<body><main><h1>Page introuvable</h1><p>Cette page n’existe pas ou plus. Le lien est peut-être ancien ou incomplet.</p><p><a href="/">Revenir à l’accueil</a></p></main></body></html>`;
  return new Response(page, {status:404, headers:{'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Robots-Tag':'noindex'}});
}
export default {
  async fetch(request, env) {
    const pathname=new URL(request.url).pathname;
    if (pathname === '/telemetry/client-error') {
      try { return await ingestClientError(request,env); }
      catch { return new Response(null,{status:204}); }
    }
    if (!pathname.startsWith('/api/')) {
      const asset = await env.ASSETS.fetch(request);
      return asset.status === 404 && (request.headers.get('Accept') || '').includes('text/html') ? pageNotFound() : asset;
    }
    try { return await api(request, env); }
    catch (error) {
      if (error instanceof HttpError) return json({error:error.message},error.status);
      const message=String(error.message);
      if (message.includes('participant_already_assigned')) return json({error:'Ce pilote est déjà affecté à un équipage sur ce départ. Modifie son inscription existante, ou retire-le de l’équipage avant de changer de catégorie ou de le déclarer indisponible.'},409);
      if (message.includes('participant_required') || message.includes('participant_fixed')) return json({error:'Recharge le site pour retrouver la fiche du pilote.'},409);
      if (message.includes('no such table: communities') || message.includes('no such column: community_id')) return json({error:'La mise à jour de la base attend la migration 0034_communities.sql.'},503);
      if (message.includes('community_mismatch') || message.includes('community_fixed') || message.includes('community_invalid')) return json({error:'Action refusée : ces données appartiennent à une autre communauté.'},403);
      if (message.includes('no such table: participants') || message.includes('no such column: r.participant_id')) return json({error:'La mise à jour de la base attend la migration 0012_participants.sql.'},503);
      if (message.includes('no such column: locked')) return json({error:'La mise à jour de la base attend la migration 0015_crew_lock.sql.'},503);
      if (message.includes('no such column: owner_user_id')) return json({error:'La mise à jour de la base attend la migration 0016_crew_ownership.sql.'},503);
      if (message.includes('UNIQUE constraint failed: crew_members.')) return json({error:'Ce pilote appartient déjà à un équipage sur ce départ. Actualise la page.'},409);
      if (message.includes('crew_category_in_use')) return json({error:'Ce pilote est affecté à un équipage de cette catégorie. Retire d’abord son affectation pour changer de catégorie.'},409);
      if (message.includes('crew_event_in_use')) return json({error:'Un équipage utilise encore ce départ ou cette catégorie. Supprime ou modifie cet équipage avant de continuer.'},409);
      if (message.includes('crew_membership_invalid') || message.includes('crew_invalid')) return json({error:'Affectation impossible : vérifie le départ, la catégorie et la disponibilité du pilote, puis actualise.'},409);
      if (message.includes('UNIQUE constraint failed: registrations.')) return json({error:'Ce pilote ou ce pseudo est déjà inscrit dans cette catégorie pour ce départ. Modifie l’inscription existante ou choisis une autre catégorie.'},409);
      console.error('API failure', error instanceof Error ? error.message.replace(/[a-f0-9]{64}/g,'[redacted]') : 'unknown');
      return json({error:'Le service est momentanément indisponible. Tes changements ne sont pas confirmés ; réessaie dans un instant.'},503);
    }
  }
};
