import {CATEGORIES, EVENT_TYPE_IDS as EVENT_TYPES, CIRCUIT_IDS as CIRCUITS, CARS, SIM_IDS, eventCatalog, simForEvent, isRandomCircuit} from '../shared/catalog.mjs';
const LEGACY_CAR_ALIASES = new Map([
  ['BMW M Hybrid V8 Evo (2026)','BMW M Hybrid V8'],['Cadillac V-Series.R Evo (2026)','Cadillac V-Series.R'],['Peugeot 9X8 2023','Peugeot 9X8'],['Peugeot 9X8 2024','Peugeot 9X8'],['Toyota TR010 Hybrid (2026)','Toyota GR010 Hybrid'],['Ginetta G61-LT-P3 Evo','Ginetta G61-LT-P3'],['Ferrari 488 GTE Evo','Ferrari 488 GTE'],['Aston Martin Vantage AMR LMGT3 Evo','Aston Martin Vantage AMR LMGT3'],['BMW M4 LMGT3 Evo','BMW M4 LMGT3'],['Ferrari 296 LMGT3 Evo','Ferrari 296 LMGT3'],['Ford Mustang LMGT3 Evo','Ford Mustang LMGT3'],['Lamborghini Huracán LMGT3 Evo 2','Lamborghini Huracán LMGT3'],['McLaren 720S LMGT3 Evo','McLaren 720S LMGT3'],['Porsche 911 LMGT3 R (992)','Porsche 911 GT3 R LMGT3'],['Porsche 911 LMGT3 R (992) 2026','Porsche 911 GT3 R LMGT3']
]);
const COOKIE_SESSION = '__Host-em_session';
const COOKIE_STATE = '__Host-em_oauth';
const COOKIE_RETURN = '__Host-em_return';
const DAY = 86400;
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const now = () => Math.floor(Date.now() / 1000);
const id = () => crypto.randomUUID();
function token() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join(''); }
function cookie(request, name) {
  return (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}
function setCookie(name, value, age, domain = '') { return `${name}=${value}; Path=/;${domain ? ` Domain=${domain};` : ''} HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`; }

// Communities platform (BASE_DOMAIN set, e.g. "endurance-manager.app"): every <community>.BASE_DOMAIN is a
// site of its own, one sign-in is shared by all of them (cookies on .BASE_DOMAIN, "__Secure-" instead of
// "__Host-", which forbids a domain), and each environment has its own cookie names so the development
// site never reads or overwrites the production session. Without BASE_DOMAIN: one site, host-only cookies.
const SLUG_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/;
function baseDomain(env) {
  const domain = String(env?.BASE_DOMAIN || '').toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : '';
}
// Names no community can take (the database refuses them too): dev.<domain> and the like are sites of their own.
const RESERVED_LABELS = new Set(['www', 'app', 'api', 'admin', 'dev', 'auth']);
// "<slug>" when the address is <slug>.BASE_DOMAIN (one level), otherwise ''.
function communityLabel(url, env) {
  const domain = baseDomain(env);
  if (!domain || url.protocol !== 'https:' || !url.hostname.endsWith('.' + domain)) return '';
  const label = url.hostname.slice(0, -domain.length - 1);
  return SLUG_LABEL.test(label) && !RESERVED_LABELS.has(label) ? label : '';
}
function cookieNames(env) {
  if (!baseDomain(env)) return {session:COOKIE_SESSION, state:COOKIE_STATE, ret:COOKIE_RETURN, domain:''};
  const prefix = `__Secure-em${env.SITE_ENV === 'development' ? '_dev' : ''}`;
  return {session:`${prefix}_session`, state:`${prefix}_oauth`, ret:`${prefix}_return`, domain:'.' + baseDomain(env)};
}
// The origin of the site the request was made on: a community address, or the main address.
function siteOrigin(request, env) {
  const url = new URL(request.url);
  return communityLabel(url, env) ? url.origin : origin(env);
}
function json(data, status = 200, cookies = []) {
  const headers = new Headers({'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'});
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(JSON.stringify(data), {status, headers});
}
function redirect(location, cookies = []) {
  const response = json({}, 302, cookies); response.headers.set('Location', location); return response;
}
function origin(env) {
  let parsed;
  try { parsed = new URL(env.APP_ORIGIN); } catch { fail(503, 'Le site attend sa configuration Cloudflare.'); }
  // Plain http is only accepted for a local `wrangler dev` preview.
  const secure = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && parsed.hostname === 'localhost');
  if (!secure || parsed.origin !== env.APP_ORIGIN) fail(503, 'L’adresse du site doit être une origine HTTPS sans barre finale.');
  return parsed.origin;
}
function requireDiscord(env) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) fail(503, 'La connexion Discord n’est pas encore configurée.');
}
const administrators = env => String(env.ADMIN_DISCORD_IDS || '').split(',').map(x => x.trim()).filter(x => /^\d{15,22}$/.test(x));
// The signed-in player (their role in the community is given by server/access.mjs).
function publicUser(row) { return row ? {id: row.id, name: row.name} : null; }
async function identity(request, env) {
  const raw = cookie(request, cookieNames(env).session);
  let user = null;
  if (/^[a-f0-9]{64}$/.test(raw)) {
    const row = await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(raw), now()).first();
    user = publicUser(row);
    // The explanation of communities, already read by this account (migration 0041).
    if (user) user.communityIntroSeen = Boolean(row.community_intro_seen);
  }
  return {user};
}
function owned(reg, actor) {
  return !!(actor.user && (reg.participant_user_id === actor.user.id || reg.user_id === actor.user.id || reg.owner_user_id === actor.user.id));
}
function personal(reg, actor) {
  return !!(actor.user && (reg.participant_user_id === actor.user.id || reg.user_id === actor.user.id));
}
const registrationSelect = `SELECT r.*,p.user_id AS participant_user_id,p.guest_hash AS participant_guest_hash,
 p.created_by AS participant_created_by,p.name AS participant_name FROM registrations r JOIN participants p ON p.id=r.participant_id`;
// Pilot entries (participants) belong to the community of the race: every lookup and creation is scoped to it.
async function registrationParticipant(env, actor, input, data, community) {
  const cid = community.id;
  // "Inscrire un autre pilote" in this community (server/access.mjs).
  const manager=Boolean(actor.permissions?.has('manage_registrations'));
  if (input.participantUserId) {
    if (!actor.user) fail(401,'Connecte-toi avec Discord pour inscrire un autre pilote.');
    if (!/^\d{15,22}$/.test(input.participantUserId)) fail(400,'Compte Discord invalide.');
    const discordUser=await env.DB.prepare('SELECT id,name FROM users WHERE id=?').bind(input.participantUserId).first();
    if (!discordUser) fail(404,'Ce pilote Discord est introuvable. Actualise la page.');
    data.name=discordUser.name;
    data.nameKey=data.name.normalize('NFKC').toLocaleLowerCase('fr-FR');
    await env.DB.prepare(`INSERT INTO participants(id,name,user_id,created_by,created_at,community_id) VALUES(?,?,?,?,?,?)
      ON CONFLICT(community_id,user_id) WHERE user_id IS NOT NULL DO UPDATE SET name=excluded.name`).bind(id(),discordUser.name,discordUser.id,actor.user.id,now(),cid).run();
    return env.DB.prepare('SELECT * FROM participants WHERE user_id=? AND community_id=?').bind(discordUser.id,cid).first();
  }
  if (input.participantId) {
    const participant=await env.DB.prepare('SELECT * FROM participants WHERE id=? AND community_id=?').bind(input.participantId,cid).first();
    if (!participant) fail(404,'Ce pilote est introuvable. Actualise la page.');
    const existing=await env.DB.prepare(registrationSelect+' WHERE r.participant_id=?').bind(participant.id).all();
    const self=!!(actor.user && participant.user_id===actor.user.id);
    if (!manager && !self && !existing.results.some(r=>owned(r,actor))) fail(403,'Tu ne peux pas inscrire ce pilote.');
    return participant;
  }
  if (input.forOther===true && !actor.user) fail(401,'Connecte-toi avec Discord pour inscrire un autre pilote.');
  if (input.forOther===true) {
    // A manually entered name is an external pilot identity, never a site/Discord account.
    // Reuse only identities created by the same account so two pilots cannot take over each other's external profile.
    const linkedUser=await env.DB.prepare('SELECT id FROM users WHERE lower(name)=lower(?) LIMIT 1').bind(data.name).first();
    if (linkedUser) fail(409,'Ce pseudo correspond à un pilote Discord. Sélectionne son compte dans la liste.');
    const existing=await env.DB.prepare(`SELECT * FROM participants
      WHERE community_id=? AND user_id IS NULL AND guest_hash IS NULL AND created_by=? AND lower(name)=lower(?)
      ORDER BY created_at,id LIMIT 1`).bind(cid,actor.user.id,data.name).first();
    if (existing) return existing;
    const participant={id:id(),name:data.name,user_id:null,guest_hash:null,created_by:actor.user.id,community_id:cid};
    await env.DB.prepare('INSERT INTO participants(id,name,created_by,created_at,community_id) VALUES(?,?,?,?,?)').bind(participant.id,participant.name,actor.user.id,now(),cid).run();
    return participant;
  }
  if (!actor.user) fail(401, 'Connecte-toi avec Discord pour t’inscrire.');
  // An own entry always shows the player's Discord name: never a pseudo typed in the form (another member's name).
  data.name=actor.user.name||data.name;
  data.nameKey=data.name.normalize('NFKC').toLocaleLowerCase('fr-FR');
  await env.DB.prepare('INSERT INTO participants(id,name,user_id,created_by,created_at,community_id) VALUES(?,?,?,?,?,?) ON CONFLICT(community_id,user_id) WHERE user_id IS NOT NULL DO NOTHING').bind(id(),data.name,actor.user.id,actor.user.id,now(),cid).run();
  return env.DB.prepare('SELECT * FROM participants WHERE user_id=? AND community_id=?').bind(actor.user.id,cid).first();
}
async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415, 'Format JSON requis.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Formulaire vide.');
  let size = 0; const chunks = [];
  while (true) { const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > 24000) { await reader.cancel(); fail(413, 'Formulaire trop volumineux.'); } chunks.push(value); }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  try { const value = JSON.parse(new TextDecoder().decode(all)); if (!value || Array.isArray(value) || typeof value !== 'object') throw Error(); return value; } catch { fail(400, 'Formulaire invalide.'); }
}
async function rateLimit(request, env, kind, limit) {
  const bucket = Math.floor(now() / 600);
  const key = await hash(`${kind}:${request.headers.get('CF-Connecting-IP') || 'local'}:${bucket}`);
  const row = await env.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key, (bucket + 1) * 600).first();
  if (row.count > limit) fail(429, 'Trop de tentatives. Réessaie dans quelques minutes.');
}
async function cleanup(env) {
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_states WHERE state_hash IN (SELECT state_hash FROM oauth_states WHERE expires_at<? LIMIT 500)').bind(timestamp),
    env.DB.prepare('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at<? LIMIT 500)').bind(timestamp),
    env.DB.prepare('DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at<? LIMIT 500)').bind(timestamp)
  ]);
}
// Same-site page to reopen after Discord login: a plain path, optionally with the open race or My entries.
// Anything else (other hosts, protocol-relative URLs, query strings) falls back to the home page.
function returnPath(value) {
  const path = typeof value === 'string' ? value : '';
  return path.length <= 200 && /^\/(?:[A-Za-z0-9._~-]+\/?)*(?:#event=[a-f0-9-]{36}|#inscriptions)?$/.test(path) ? path : '/';
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `${label} : indique de 1 à ${max} caractères.`);
  return value.trim();
}
// Convert a Europe/Paris local time explicitly, rejecting nonexistent DST times.
function parisTimestamp(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) fail(400, 'Date ou heure invalide.');
  const [y, m, d] = date.split('-').map(Number), [h, min] = time.split(':').map(Number);
  if (y < 2020 || y > 2100 || h > 23 || min > 59) fail(400, 'Date ou heure invalide.');
  const utc = Date.UTC(y, m - 1, d, h, min);
  const fmt = new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
  const matches = [];
  for (const hours of [2, 1]) {
    const stamp = utc - hours * 3600000;
    const p = Object.fromEntries(fmt.formatToParts(stamp).map(x => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === time) matches.push(stamp);
  }
  if (matches.length !== 1) fail(400, 'Cette heure est inexistante ou ambiguë lors du changement d’heure. Choisis un autre horaire.');
  return matches[0];
}
const EVENT_FORMATS = ['endurance','solo'];
const SOLO_ACCESS = ['open','safe'];
const WEATHERS = ['random','sun','cloud','overcast','rain'];
// An event of the calendar (solo format): a simulator, one to four rounds (circuit and duration in minutes),
// one start, an optional number of places and an OPEN / SAFE access. LMU circuits and categories come from
// the catalog; on the other simulators the circuit, category and car are typed.
function validateSoloRace(input, existing) {
  const access = input.access == null ? (existing?.access || 'open') : input.access;
  if (!SOLO_ACCESS.includes(access)) fail(400, 'Choisis l’accès OPEN ou SAFE.');
  const rounds = input.rounds;
  if (!Array.isArray(rounds) || rounds.length < 1 || rounds.length > 4) fail(400, 'Un événement a de une à quatre manches.');
  const sim = input.sim == null ? (existing ? simForEvent(existing) : simForEvent({circuit:rounds[0]?.circuit})) : input.sim;
  if (!SIM_IDS.includes(sim)) fail(400, 'Choisis le simulateur.');
  const catalog = eventCatalog(sim);
  const cleanRounds = rounds.map((round, index) => {
    const where = rounds.length > 1 ? ` de la manche ${index + 1}` : '';
    const circuit = catalog ? (typeof round?.circuit === 'string' ? round.circuit : '') : text(round?.circuit, 60, `Circuit${where}`);
    if (catalog && (!CIRCUITS.includes(circuit) || circuit.startsWith('iracing-') !== (sim === 'iracing'))) fail(400, `Choisis le circuit${where}.`);
    const durationMinutes = Number(round.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 600) fail(400, `La durée${where} doit être comprise entre 5 et 600 minutes.`);
    // Categories: optional; none means a simple entry (no category or car to choose).
    // A random circuit (LMU) comes with a random category: nothing to choose.
    const randomCategory = Boolean(catalog && isRandomCircuit(circuit));
    const roundCategories = randomCategory ? [] : Array.isArray(round.categories) && round.categories.length ? round.categories : Array.isArray(input.categories) ? input.categories : [];
    if (roundCategories.length && (!catalog || roundCategories.some(c => !catalog.categories[c]))) fail(400, 'Catégorie inconnue pour ce simulateur.');
    // As on the community's calendar: practice / qualifying minutes (race = durationMinutes), weather,
    // fuel and tyre wear multipliers. All optional.
    const extras = randomCategory ? {randomCategory: true} : {};
    for (const key of ['practice','qualifying']) if (round[key] != null && round[key] !== '') {
      const value = Number(round[key]);
      if (!Number.isInteger(value) || value < 0 || value > 600) fail(400, `Durée des essais ou qualifs${where} invalide.`);
      extras[key] = value;
    }
    for (const key of ['fuel','tyres']) if (round[key] != null && round[key] !== '') {
      const value = Number(round[key]);
      if (!Number.isInteger(value) || value < 0 || value > 10) fail(400, `Multiplicateur essence ou pneus${where} invalide.`);
      extras[key] = value;
    }
    if (round.weather) { if (!WEATHERS.includes(round.weather)) fail(400, `Météo${where} invalide.`); extras.weather = round.weather; }
    // Simulators without a catalog: the category and the car are typed.
    if (!catalog) {
      if (round.category) extras.category = text(round.category, 40, `Catégorie${where}`);
      if (round.car) extras.car = text(round.car, 60, `Voiture${where}`);
    }
    return {circuit, durationMinutes, categories:[...new Set(roundCategories)], ...extras};
  });
  const capacity = input.capacity == null || input.capacity === '' ? null : Number(input.capacity);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 2 || capacity > 120)) fail(400, 'Le nombre de places doit être compris entre 2 et 120.');
  // Event details: an end time (open sessions, « 17h-00h »), the server password and a short note.
  const raw = input.details && typeof input.details === 'object' ? input.details : {};
  const details = {};
  if (raw.type) details.type = text(raw.type, 20, 'Type');
  if (raw.endTime) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.endTime)) fail(400, 'Heure de fin invalide.'); details.endTime = raw.endTime; }
  if (raw.password) details.password = text(raw.password, 30, 'Mot de passe');
  if (raw.note) details.note = text(raw.note, 120, 'Info');
  const roundsMinutes = cleanRounds.reduce((sum, round) => sum + (round.practice || 0) + (round.qualifying || 0) + round.durationMinutes, 0);
  const startTime = input.departures?.[0]?.time;
  const windowMinutes = details.endTime && /^\d{2}:\d{2}$/.test(startTime || '') ? (() => { const [h1, m1] = startTime.split(':').map(Number), [h2, m2] = details.endTime.split(':').map(Number); return ((h2 * 60 + m2) - (h1 * 60 + m1) + 1440) % 1440 || 1440; })() : 0;
  const totalMinutes = Math.max(roundsMinutes, windowMinutes);
  if (totalMinutes > 24 * 60) fail(400, 'Un événement ne peut pas dépasser 24 heures.');
  const categories = [...new Set(cleanRounds.flatMap(round => round.categories))];
  return {sim, access, rounds:cleanRounds, capacity, categories, details, circuit:cleanRounds[0].circuit, durationMinutes:totalMinutes};
}
function validateEvent(input, existing = null) {
  const name = text(input.name, 100, 'Nom de l’événement');
  // The format is chosen at creation and never changes (crews and solo entries do not mix).
  const format = existing ? (existing.format || 'endurance') : (input.format == null ? 'endurance' : input.format);
  if (!EVENT_FORMATS.includes(format)) fail(400, 'Format d’événement invalide.');
  const solo = format === 'solo' ? validateSoloRace(input, existing) : null;
  // Duration in minutes (endurances: 1 h to 24 h, in 5-minute steps); older clients send whole hours.
  const durationMinutes = solo ? solo.durationMinutes : input.durationMinutes != null ? Number(input.durationMinutes) : input.durationHours == null ? 360 : Number(input.durationHours) * 60;
  if (!solo && (!Number.isInteger(durationMinutes) || durationMinutes < 60 || durationMinutes > 1440 || durationMinutes % 5)) fail(400, 'La durée doit être comprise entre 1 h et 24 h, par pas de 5 minutes.');
  // Presence slots: one per hour started (2 h 30 → 3 slots).
  const durationHours = Math.max(1, Math.ceil(durationMinutes / 60));
  const eventType = solo ? 'private' : input.eventType || 'private';
  if (!EVENT_TYPES.includes(eventType)) fail(400, 'Type d’événement invalide.');
  const circuit = solo ? solo.circuit : input.circuit == null ? (existing?.circuit || '') : (input.circuit === '' ? '' : text(input.circuit, 40, 'Circuit'));
  if (!solo && circuit && !CIRCUITS.includes(circuit)) fail(400, 'Choisis un circuit proposé.');
  const categoriesInput = solo ? solo.categories : input.categories;
  if (!solo && (!Array.isArray(categoriesInput) || !categoriesInput.length || categoriesInput.some(c => !CATEGORIES.includes(c)))) fail(400, 'Choisis au moins une catégorie autorisée.');
  if (!Array.isArray(input.departures) || !input.departures.length || input.departures.length > 30) fail(400, 'Ajoute entre 1 et 30 départs.');
  if (solo && input.departures.length !== 1) fail(400, 'Un événement a un seul départ.');
  const known = existing ? JSON.parse(existing.departures) : [];
  const seen = new Set(), ids = new Set();
  const departures = input.departures.map(item => {
    if (!item || typeof item !== 'object') fail(400, 'Départ invalide.');
    const startsAt = parisTimestamp(item.date, item.time);
    const previous = item.id ? known.find(d => d.id === item.id) : null;
    // "Horaire à définir": a common start where everyone enters and forms crews until the real times are
    // known (both simulators). Kept as long as its date and time are unchanged, or when sent as such.
    // The event form always says it (true / false); older pages and the import may leave it out.
    const tbd = typeof item.tbd === 'boolean' ? item.tbd : Boolean(previous?.tbd && previous.startsAt === startsAt);
    if (!tbd) { if (seen.has(startsAt)) fail(400, 'Deux départs ont la même date et la même heure.'); seen.add(startsAt); }
    if (item.id && !previous) fail(400, 'Départ inconnu.');
    const departureId = previous?.id || id();
    if (ids.has(departureId)) fail(400, 'Départ répété.'); ids.add(departureId);
    if (previous && previous.startsAt <= Date.now() && startsAt !== previous.startsAt) fail(400, 'Un départ passé ne peut plus être déplacé.');
    return {id: departureId, date: item.date, time: item.time, startsAt, ...(tbd ? {tbd:true} : {})};
  }).sort((a, b) => a.startsAt - b.startsAt);
  const common = departures.filter(departure => departure.tbd);
  if (common.length > 1) fail(400, 'Un seul départ « à définir » par course.');
  const timed = departures.filter(departure => !departure.tbd);
  // Real times known: the common start closes with the first of them (each crew then picks its start).
  if (common.length && timed.length && common[0].startsAt !== timed[0].startsAt) Object.assign(common[0], {date:timed[0].date, time:timed[0].time, startsAt:timed[0].startsAt});
  departures.sort((a, b) => a.startsAt - b.startsAt || Number(Boolean(b.tbd)) - Number(Boolean(a.tbd)));
  const schedulePending = input.schedulePending == null ? Boolean(existing?.schedule_pending) : input.schedulePending === true;
  // Driver change required (iRacing endurances; always on LMU): true / false, or null for the site rule.
  const driverChangeRequired = solo ? null : typeof input.driverChangeRequired === 'boolean' ? input.driverChangeRequired
    : input.driverChangeRequired === undefined && existing?.driver_change_required != null ? Boolean(existing.driver_change_required) : null;
  return {name, format, sim: solo?.sim || null, details: solo?.details || {}, access: solo?.access || 'open', capacity: solo?.capacity ?? null, rounds: solo?.rounds || [], durationHours, durationMinutes, eventType, circuit, schedulePending, driverChangeRequired, categories: [...new Set(categoriesInput)], departures};
}
// Discord display names are at most 32 characters: registrations accept the same length.
const PILOT_NAME_MAX = 32;
// Solo race entry: category and car, each of them possibly "Peu importe" (category '*'); no hours.
const ANY_CATEGORY = '*';
function validateSoloChoice(choice, allowed, index, rounds) {
  const category = choice?.category;
  const where = rounds > 1 ? ` pour la manche ${index + 1}` : '';
  if (category !== ANY_CATEGORY && !allowed.includes(category)) fail(400, `Choisis une catégorie${where}, ou « Peu importe ».`);
  const rawCars = category === ANY_CATEGORY ? [] : Array.isArray(choice.cars) ? choice.cars : [];
  const cars = [...new Set(rawCars.filter(car => typeof car === 'string' && car.trim()).map(car => LEGACY_CAR_ALIASES.get(car) || car))];
  if (cars.some(car => !CARS[category]?.includes(car))) fail(400, `Choisis uniquement des voitures proposées${where}.`);
  const carAny = category === ANY_CATEGORY || choice.carAny === true || !cars.length;
  return {category, cars: carAny ? [] : cars, carAny};
}
function validateSoloRegistration(input, event) {
  const name = text(input.name, PILOT_NAME_MAX, 'Pseudo');
  const eventCategories = JSON.parse(event.categories);
  const rounds = JSON.parse(event.rounds || '[]');
  const roundCategories = rounds.length ? rounds.map(round => round.randomCategory ? [] : round.categories?.length ? round.categories : eventCategories) : [eventCategories];
  // Several rounds: a pilot may skip some of them ({skip:true}), not all.
  const multi = roundCategories.length > 1, skips = multi && Array.isArray(input.choices) && input.choices.length === roundCategories.length ? input.choices.map(choice => choice?.skip === true) : [];
  if (skips.length && skips.every(Boolean)) fail(400, 'Choisis au moins une manche.');
  // No category offered: a simple entry (every round, unless some are skipped).
  if (roundCategories.every(list => !list.length)) return {name, nameKey: name.normalize('NFKC').toLocaleLowerCase('fr-FR'), status: 'whole', category: '', car: '', cars: [], carAny: true, preferredPilot: '', roundChoices: skips.some(Boolean) ? skips.map(skip => skip ? {skip: true} : {category: '', cars: [], carAny: true}) : []};
  // One choice per round; a single-round entry may still send category / cars directly.
  const rawChoices = Array.isArray(input.choices) ? input.choices : [{category:input.category, cars:input.cars, carAny:input.carAny}];
  if (rawChoices.length !== roundCategories.length) fail(400, 'Choisis une catégorie pour chaque manche.');
  const choices = rawChoices.map((choice, index) => skips[index] ? {skip: true} : validateSoloChoice(choice, roundCategories[index], index, roundCategories.length));
  const first = choices.find(choice => !choice.skip);
  return {name, nameKey: name.normalize('NFKC').toLocaleLowerCase('fr-FR'), status: 'whole', category: first.category, car: first.cars[0] || '', cars: first.cars, carAny: first.carAny, preferredPilot: '', roundChoices: choices};
}
function validateRegistration(input, event) {
  if ((event.format || 'endurance') === 'solo') return validateSoloRegistration(input, event);
  const name = text(input.name, PILOT_NAME_MAX, 'Pseudo');
  const preferredPilot = typeof input.preferredPilot === 'string' && input.preferredPilot.trim() ? text(input.preferredPilot, PILOT_NAME_MAX, 'Pilote souhaité') : '';
  const durationHours = Number(event.duration_hours) || 3;
  const parts = typeof input.status === 'string' ? input.status.split(',').filter(Boolean) : [];
  const hourParts = parts.filter(part => /^h([1-9]|1[0-9]|2[0-4])$/.test(part));
  const legacy = ['beginning','middle','end'];
  const validParts = input.status === 'whole' || input.status === 'unavailable' ||
    (parts.length > 0 && parts.length <= durationHours && parts.every(part => hourParts.includes(part) && Number(part.slice(1)) <= durationHours)) ||
    (parts.length > 0 && parts.length <= 3 && parts.every(part => legacy.includes(part)));
  if (!validParts) fail(400, 'Choisis au moins une heure de disponibilité.');
  const category = input.status === 'unavailable' ? '' : input.category;
  if (category && !JSON.parse(event.categories).includes(category) || input.status !== 'unavailable' && !category) fail(400, 'Choisis une catégorie de cet événement.');
  const rawCars = input.status === 'unavailable' ? [] : Array.isArray(input.cars) ? input.cars : (input.car ? [input.car] : []);
  const cars = [...new Set(rawCars.filter(car => typeof car === 'string' && car.trim()).map(car => text(car, 100, 'Voiture')))];
  const carAny = input.status !== 'unavailable' && input.carAny === true;
  const normalizedCars = cars.map(car => LEGACY_CAR_ALIASES.get(car) || car);
  if (normalizedCars.some(car => !CARS[category]?.includes(car))) fail(400, 'Choisis uniquement des voitures proposées pour cette catégorie.');
  cars.splice(0, cars.length, ...normalizedCars);
  if (carAny) cars.length = 0;
  const car = cars[0] || '';
  // "Je la fais tout seul": the driver races the whole race without a team-mate.
  const soloDriver = input.status !== 'unavailable' && input.soloDriver === true;
  return {name, nameKey: name.normalize('NFKC').toLocaleLowerCase('fr-FR'), status: soloDriver ? 'whole' : input.status, category, car, cars, carAny, preferredPilot, soloDriver};
}

export {
  LEGACY_CAR_ALIASES, COOKIE_SESSION, COOKIE_STATE, COOKIE_RETURN, DAY, HttpError, fail, now, id, token, hash, cookie,
  setCookie, cookieNames, siteOrigin, communityLabel, baseDomain, json, redirect, origin, requireDiscord, administrators, identity, owned, personal,
  registrationSelect, registrationParticipant, body, rateLimit, cleanup, returnPath, text, parisTimestamp, validateEvent, validateRegistration, ANY_CATEGORY
};
