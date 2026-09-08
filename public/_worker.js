const CATEGORIES = ['Hypercar', 'LMP2 ELMS', 'LMP2 WEC', 'LMP3', 'GT3', 'GTE'];
const EVENT_TYPES = ['special', 'lmu', 'private'];
const CIRCUITS = ['bahrain','barcelona','cota','daytona','fuji','imola','interlagos','laguna-seca','le-mans','lusail','monza','nurburgring','paul-ricard','portimao','sebring','silverstone','spa'];
const CARS = {
  Hypercar: ['Alpine A424','Aston Martin Valkyrie AMR LMH','BMW M Hybrid V8','Cadillac V-Series.R','Ferrari 499P','Genesis GMR-001 LMDh','Glickenhaus SCG 007','Isotta Fraschini Tipo 6-C','Lamborghini SC63','Peugeot 9X8','Porsche 963','Toyota GR010 Hybrid','Vanwall Vandervell 680'],
  'LMP2 ELMS': ['Oreca 07 Gibson ELMS'],
  'LMP2 WEC': ['Oreca 07 Gibson'],
  LMP3: ['Ligier JS P325','Ginetta G61-LT-P3','Duqueine D09','Adess AD25'],
  GT3: ['Aston Martin Vantage AMR LMGT3','BMW M4 LMGT3','Chevrolet Corvette Z06 LMGT3.R','Ferrari 296 LMGT3','Ford Mustang LMGT3','Lamborghini Huracán LMGT3','Lexus RC F LMGT3','Mercedes-AMG LMGT3','McLaren 720S LMGT3','Porsche 911 GT3 R LMGT3'],
  GTE: ['Aston Martin Vantage GTE','Chevrolet Corvette C8.R','Ferrari 488 GTE','Porsche 911 RSR-19']
};
const LEGACY_CAR_ALIASES = new Map([
  ['BMW M Hybrid V8 Evo (2026)','BMW M Hybrid V8'],['Cadillac V-Series.R Evo (2026)','Cadillac V-Series.R'],['Peugeot 9X8 2023','Peugeot 9X8'],['Peugeot 9X8 2024','Peugeot 9X8'],['Toyota TR010 Hybrid (2026)','Toyota GR010 Hybrid'],['Ginetta G61-LT-P3 Evo','Ginetta G61-LT-P3'],['Ferrari 488 GTE Evo','Ferrari 488 GTE'],['Aston Martin Vantage AMR LMGT3 Evo','Aston Martin Vantage AMR LMGT3'],['BMW M4 LMGT3 Evo','BMW M4 LMGT3'],['Ferrari 296 LMGT3 Evo','Ferrari 296 LMGT3'],['Ford Mustang LMGT3 Evo','Ford Mustang LMGT3'],['Lamborghini Huracán LMGT3 Evo 2','Lamborghini Huracán LMGT3'],['McLaren 720S LMGT3 Evo','McLaren 720S LMGT3'],['Porsche 911 LMGT3 R (992)','Porsche 911 GT3 R LMGT3'],['Porsche 911 LMGT3 R (992) 2026','Porsche 911 GT3 R LMGT3']
]);
const COOKIE_SESSION = '__Host-fmt_session';
const COOKIE_GUEST = '__Host-fmt_guest';
const COOKIE_STATE = '__Host-fmt_oauth';
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
function setCookie(name, value, age) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`; }
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
  if (parsed.protocol !== 'https:' || parsed.origin !== env.APP_ORIGIN) fail(503, 'L’adresse du site doit être une origine HTTPS sans barre finale.');
  return parsed.origin;
}
function requireDiscord(env) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) fail(503, 'La connexion Discord n’est pas encore configurée.');
}
const administrators = env => String(env.ADMIN_DISCORD_IDS || '').split(',').map(x => x.trim()).filter(x => /^\d{15,22}$/.test(x));
function publicUser(row, env) { return row ? {id: row.id, name: row.name, role: administrators(env).includes(row.id) ? 'admin' : row.role} : null; }
function requireRole(user, admin = false) {
  if (!user) fail(401, 'Connecte-toi avec Discord.');
  if (admin ? user.role !== 'admin' : !['admin', 'organizer'].includes(user.role)) fail(403, 'Tu n’as pas l’autorisation de gérer les événements.');
}
async function identity(request, env) {
  const raw = cookie(request, COOKIE_SESSION);
  let user = null;
  if (/^[a-f0-9]{64}$/.test(raw)) {
    const row = await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(raw), now()).first();
    user = publicUser(row, env);
  }
  const guest = cookie(request, COOKIE_GUEST);
  return {user, guestHash: /^[a-f0-9]{64}$/.test(guest) ? await hash(guest) : null, guestToken: /^[a-f0-9]{64}$/.test(guest) ? guest : null};
}
function owned(reg, actor) {
  return !!((actor.user && (reg.user_id === actor.user.id || reg.owner_user_id === actor.user.id)) ||
    (actor.guestHash && reg.guest_hash === actor.guestHash));
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
function validateEvent(input, existing = null) {
  const name = text(input.name, 100, 'Nom de l’événement');
  const durationHours = input.durationHours == null ? 6 : Number(input.durationHours);
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 24) fail(400, 'La durée doit être comprise entre 1 et 24 heures.');
  const eventType = input.eventType || 'private';
  if (!EVENT_TYPES.includes(eventType)) fail(400, 'Type d’événement invalide.');
  const circuit = input.circuit == null ? (existing?.circuit || '') : (input.circuit === '' ? '' : text(input.circuit, 40, 'Circuit'));
  if (circuit && !CIRCUITS.includes(circuit)) fail(400, 'Choisis un circuit proposé.');
  if (!Array.isArray(input.categories) || !input.categories.length || input.categories.some(c => !CATEGORIES.includes(c))) fail(400, 'Choisis au moins une catégorie autorisée.');
  if (!Array.isArray(input.departures) || !input.departures.length || input.departures.length > 30) fail(400, 'Ajoute entre 1 et 30 départs.');
  const known = existing ? JSON.parse(existing.departures) : [];
  const seen = new Set(), ids = new Set();
  const departures = input.departures.map(item => {
    if (!item || typeof item !== 'object') fail(400, 'Départ invalide.');
    const startsAt = parisTimestamp(item.date, item.time);
    if (seen.has(startsAt)) fail(400, 'Deux départs ont la même date et la même heure.'); seen.add(startsAt);
    const previous = item.id ? known.find(d => d.id === item.id) : null;
    if (item.id && !previous) fail(400, 'Départ inconnu.');
    const departureId = previous?.id || id();
    if (ids.has(departureId)) fail(400, 'Départ répété.'); ids.add(departureId);
    if (previous && previous.startsAt <= Date.now() && startsAt !== previous.startsAt) fail(400, 'Un départ passé ne peut plus être déplacé.');
    return {id: departureId, date: item.date, time: item.time, startsAt};
  }).sort((a, b) => a.startsAt - b.startsAt);
  return {name, durationHours, eventType, circuit, categories: [...new Set(input.categories)], departures};
}
function validateRegistration(input, event) {
  const name = text(input.name, 30, 'Pseudo');
  const preferredPilot = typeof input.preferredPilot === 'string' && input.preferredPilot.trim() ? text(input.preferredPilot, 30, 'Pilote souhaité') : '';
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
  return {name, nameKey: name.normalize('NFKC').toLocaleLowerCase('fr-FR'), status: input.status, category, car, cars, carAny, preferredPilot};
}
async function eventById(env, eventId) {
  const row = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(eventId).first();
  if (!row) fail(404, 'Événement introuvable.'); return row;
}
function departureById(event, departureId) {
  const departure = JSON.parse(event.departures).find(d => d.id === departureId);
  if (!departure) fail(404, 'Départ introuvable.');
  return departure;
}
function publicRegistration(reg, actor) {
  let cars = [];
  try { cars = JSON.parse(reg.car_preferences || '[]'); } catch {}
  if (!Array.isArray(cars) || !cars.length) cars = reg.car ? [reg.car] : [];
  cars = cars.map(car => LEGACY_CAR_ALIASES.get(car) || car);
  return {id:reg.id, name:reg.name, category:reg.category, car:cars[0] || reg.car || '', cars, carAny:Boolean(reg.car_any), status:reg.status, preferredPilot:reg.preferred_pilot || '', version:reg.version, mine:owned(reg, actor), canEdit:owned(reg, actor) || actor.user?.role === 'admin'};
}
async function listEvents(env, actor) {
  const rows = (await env.DB.prepare('SELECT * FROM events ORDER BY created_at DESC, id DESC').all()).results;
  const registrations = (await env.DB.prepare('SELECT * FROM registrations ORDER BY created_at').all()).results;
  const crews = (await env.DB.prepare('SELECT id,event_id,departure_id,name,category,car,version FROM crews ORDER BY created_at,id').all()).results;
  const memberships = (await env.DB.prepare('SELECT crew_id,registration_id FROM crew_members').all()).results;
  const grouped = new Map();
  for (const reg of registrations) { const key = `${reg.event_id}:${reg.departure_id}`; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(publicRegistration(reg, actor)); }
  return rows.map(row => ({id:row.id, name:row.name, circuit:row.circuit||'', durationHours:Number(row.duration_hours)||3, eventType:row.event_type||'private', categories:JSON.parse(row.categories), version:row.version, departures:JSON.parse(row.departures).map(d => ({...d, availability:grouped.get(`${row.id}:${d.id}`) || [], crews:crews.filter(c=>c.event_id===row.id&&c.departure_id===d.id).map(c=>({id:c.id,name:c.name,category:c.category,car:c.car,version:c.version,registrationIds:memberships.filter(m=>m.crew_id===c.id).map(m=>m.registration_id)}))}))}));
}
async function oauthStart(request, env) {
  requireDiscord(env); await rateLimit(request, env, 'oauth', 20); await cleanup(env);
  const state = token();
  await env.DB.prepare('INSERT INTO oauth_states(state_hash,expires_at) VALUES(?,?)').bind(await hash(state), now() + 600).run();
  const auth = new URL('https://discord.com/oauth2/authorize');
  auth.search = new URLSearchParams({client_id:env.DISCORD_CLIENT_ID, response_type:'code', redirect_uri:origin(env) + '/api/auth/discord/callback', scope:'identify', state}).toString();
  return redirect(auth.href, [setCookie(COOKIE_STATE, state, 600)]);
}
async function oauthCallback(request, env) {
  requireDiscord(env);
  const url = new URL(request.url), state = url.searchParams.get('state');
  const clear = setCookie(COOKIE_STATE, '', 0);
  if (!state || !/^[a-f0-9]{64}$/.test(state) || state !== cookie(request, COOKIE_STATE)) return redirect(origin(env) + '/?auth=error', [clear]);
  const row = await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING state_hash').bind(await hash(state), now()).first();
  if (!row || !url.searchParams.get('code') || url.searchParams.has('error')) return redirect(origin(env) + '/?auth=error', [clear]);
  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID, client_secret:env.DISCORD_CLIENT_SECRET, grant_type:'authorization_code', code:url.searchParams.get('code'), redirect_uri:origin(env) + '/api/auth/discord/callback'}), signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw Error('token');
    const auth = await response.json();
    const profileResponse = await fetch('https://discord.com/api/v10/users/@me', {headers:{Authorization:`Bearer ${auth.access_token}`}, signal:AbortSignal.timeout(10000)});
    if (!profileResponse.ok) throw Error('profile');
    const profile = await profileResponse.json();
    if (!/^\d{15,22}$/.test(profile.id)) throw Error('identity');
    const display = String(profile.global_name || profile.username || 'Pilote').slice(0, 80);
    const session = token();
    const guestRaw = cookie(request, COOKIE_GUEST);
    const guestHash = /^[a-f0-9]{64}$/.test(guestRaw) ? await hash(guestRaw) : null;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').bind(profile.id, display, now()),
      ...(guestHash ? [env.DB.prepare('UPDATE registrations SET owner_user_id=? WHERE guest_hash=? AND owner_user_id IS NULL').bind(profile.id, guestHash)] : []),
      env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await hash(session), profile.id, now() + 7 * DAY)
    ]);
    const old = cookie(request, COOKIE_SESSION);
    if (old) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(old)).run();
    return redirect(origin(env) + '/', [clear, setCookie(COOKIE_SESSION, session, 7 * DAY)]);
  } catch {
    return redirect(origin(env) + '/?auth=error', [clear]);
  }
}
async function api(request, env) {
  if (!env.DB) fail(503, 'La base partagée n’est pas encore configurée.');
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const canonical = origin(env);
  if (url.origin !== canonical) fail(403, 'Utilise l’adresse principale du site pour cette action.');
  if (!['GET','HEAD'].includes(method)) {
    if (request.headers.get('Origin') !== canonical) fail(403, 'Origine de la requête refusée.');
    await rateLimit(request, env, 'write', 80);
  }
  if (path === '/api/auth/discord' && method === 'GET') return oauthStart(request, env);
  if (path === '/api/auth/discord/callback' && method === 'GET') return oauthCallback(request, env);
  const actor = await identity(request, env);
  if (path === '/api/session' && method === 'GET') return json({user:actor.user, discordReady:!!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET), adminConfigured:administrators(env).length > 0});
  if (path === '/api/auth/logout' && method === 'POST') {
    const raw = cookie(request, COOKIE_SESSION);
    if (raw) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(raw)).run();
    return json({ok:true}, 200, [setCookie(COOKIE_SESSION, '', 0)]);
  }
  if (path === '/api/guest/recover' && method === 'POST') {
    const input = await body(request);
    if (!/^[a-f0-9]{64}$/.test(input.token || '')) fail(400, 'Lien personnel invalide.');
    const reg = await env.DB.prepare('SELECT id FROM registrations WHERE guest_hash=? LIMIT 1').bind(await hash(input.token)).first();
    if (!reg) fail(404, 'Ce lien ne correspond plus à une inscription.');
    return json({ok:true}, 200, [setCookie(COOKIE_GUEST, input.token, 365 * DAY)]);
  }
  if (path === '/api/guest/link' && method === 'POST') {
    if (!actor.guestToken || !(await env.DB.prepare('SELECT id FROM registrations WHERE guest_hash=? LIMIT 1').bind(actor.guestHash).first())) fail(404, 'Aucune inscription invitée sur cet appareil.');
    return json({link:canonical + '/#access=' + actor.guestToken});
  }
  if (path === '/api/events' && method === 'GET') return json({events:await listEvents(env, actor)});
  const crewCreate = path.match(/^\/api\/events\/([a-f0-9-]{36})\/departures\/([a-f0-9-]{36})\/crews$/);
  const crewRoute = path.match(/^\/api\/crews\/([a-f0-9-]{36})(?:\/members(?:\/([a-f0-9-]{36}))?)?$/);
  if ((crewCreate && method==='POST') || (crewRoute && ['POST','PATCH','DELETE'].includes(method))) {
    requireRole(actor.user);
    const input=await body(request);
    const crew=crewRoute ? await env.DB.prepare('SELECT * FROM crews WHERE id=?').bind(crewRoute[1]).first() : null;
    if (crewRoute && !crew) fail(404,'Équipage introuvable.');
    const event=await eventById(env,crew?.event_id || crewCreate[1]);
    const departure=departureById(event,crew?.departure_id || crewCreate[2]);
    if (departure.startsAt<=Date.now()) fail(409,'Ce départ est passé. Les équipages sont verrouillés.');
    if (crew && input.version!==crew.version) fail(409,'Cet équipage a changé. Actualise avant de réessayer.');
    const membership=crewRoute && path.includes('/members');
    if (membership) {
      if (method==='POST' && !crewRoute[2]) {
        if (!/^[a-f0-9-]{36}$/.test(input.registrationId || '')) fail(400,'Sélectionne un pilote inscrit.');
        const selected=await env.DB.prepare('SELECT * FROM registrations WHERE id=?').bind(input.registrationId).first();
        if (!selected || selected.event_id!==crew.event_id || selected.departure_id!==crew.departure_id) fail(409,'Ce pilote n’est pas inscrit sur ce départ. Actualise la page.');
        // Bump version and assign in one atomic batch; stale writes cannot assign anyone.
        const results=await env.DB.batch([
          env.DB.prepare('UPDATE crews SET version=version+1 WHERE id=? AND version=?').bind(crew.id,input.version),
          env.DB.prepare('INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE changes()=1').bind(input.registrationId,crew.id),
          env.DB.prepare(`DELETE FROM registrations WHERE id!=? AND event_id=? AND departure_id=? AND category!=? AND (
            (user_id IS NOT NULL AND user_id=?) OR
            (guest_hash IS NOT NULL AND guest_hash=?) OR
            (user_id IS NULL AND guest_hash IS NULL AND owner_user_id IS NOT NULL AND owner_user_id=? AND name_key=?)
          )`).bind(selected.id,selected.event_id,selected.departure_id,selected.category,selected.user_id,selected.guest_hash,selected.owner_user_id,selected.name_key)
        ]);
        if (!results[0].meta.changes) fail(409,'Cet équipage a changé. Actualise la page.');
      } else if (method==='DELETE' && crewRoute[2]) {
        const results=await env.DB.batch([
          env.DB.prepare('UPDATE crews SET version=version+1 WHERE id=? AND version=?').bind(crew.id,input.version),
          env.DB.prepare('DELETE FROM crew_members WHERE crew_id=? AND registration_id=? AND changes()=1').bind(crew.id,crewRoute[2])
        ]);
        if (!results[0].meta.changes) fail(409,'Cet équipage a changé. Actualise la page.');
      } else fail(404,'Action introuvable.');
      return json({ok:true});
    }
    if (crew && method==='DELETE') {
      const result=await env.DB.prepare('DELETE FROM crews WHERE id=? AND version=?').bind(crew.id,input.version).run();
      if (!result.meta.changes) fail(409,'Cet équipage a changé. Actualise la page.');
      return json({ok:true});
    }
    if (crew && method!=='PATCH') fail(404,'Action introuvable.');
    const name=text(input.name,60,'Nom de l’équipage');
    if (!JSON.parse(event.categories).includes(input.category)) fail(400,'Choisis une catégorie de cet événement.');
    const car=input.car==null || input.car==='' ? '' : text(input.car,100,'Voiture');
    const crewId=crew?.id || id();
    const result=crew
      ? await env.DB.prepare('UPDATE crews SET name=?,category=?,car=?,version=version+1 WHERE id=? AND version=?').bind(name,input.category,car,crewId,input.version).run()
      : await env.DB.prepare('INSERT INTO crews(id,event_id,departure_id,name,category,car,created_at) VALUES(?,?,?,?,?,?,?)').bind(crewId,event.id,departure.id,name,input.category,car,now()).run();
    if (!result.meta.changes) fail(409,'Cet équipage a changé. Actualise la page.');
    return json({id:crewId},crew?200:201);
  }
  if (path === '/api/events' && method === 'POST') {
    requireRole(actor.user);
    const data = validateEvent(await body(request)), eventId = id();
    await env.DB.prepare('INSERT INTO events(id,name,duration_hours,event_type,circuit,categories,departures,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(eventId, data.name, data.durationHours, data.eventType, data.circuit, JSON.stringify(data.categories), JSON.stringify(data.departures), actor.user.id, now()).run();
    return json({id:eventId}, 201);
  }
  const eventMatch = path.match(/^\/api\/events\/([a-f0-9-]{36})$/);
  if (eventMatch && ['PATCH','DELETE'].includes(method)) {
    requireRole(actor.user, method === 'DELETE');
    const event = await eventById(env, eventMatch[1]), input = await body(request);
    if (input.version !== event.version) fail(409, 'Cet événement a changé. Actualise avant de réessayer.');
    if (method === 'DELETE') {
      const result = await env.DB.prepare('DELETE FROM events WHERE id=? AND version=?').bind(event.id, input.version).run();
      if (!result.meta.changes) fail(409, 'Cet événement a changé. Actualise la page.');
      return json({ok:true});
    }
    const data = validateEvent(input, event), cats = JSON.stringify(data.categories), deps = JSON.stringify(data.departures);
    // Keep booked departures and their categories valid, including concurrent registrations.
    const result = await env.DB.prepare(`UPDATE events SET name=?,duration_hours=?,event_type=?,circuit=?,categories=?,departures=?,version=version+1 WHERE id=? AND version=?
      AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.event_id=events.id AND
        (NOT EXISTS (SELECT 1 FROM json_each(?) d WHERE json_extract(d.value,'$.id')=r.departure_id)
      OR (r.category!='' AND NOT EXISTS (SELECT 1 FROM json_each(?) c WHERE c.value=r.category))))`).bind(data.name, data.durationHours, data.eventType, data.circuit, cats, deps, event.id, input.version, deps, cats).run();
    if (!result.meta.changes) fail(409, 'Modification impossible : événement modifié ailleurs, départ supprimé avec des inscrits, ou catégorie encore utilisée.');
    return json({ok:true});
  }
  const departureMatch = path.match(/^\/api\/events\/([a-f0-9-]{36})\/departures\/([a-f0-9-]{36})\/registrations$/);
  if (departureMatch && method === 'POST') {
    const event = await eventById(env, departureMatch[1]);
    const departure = departureById(event, departureMatch[2]);
    if (departure.startsAt <= Date.now()) fail(409, 'Ce départ est passé. Les inscriptions sont fermées.');
    const input = await body(request), data = validateRegistration(input, event);
    const managedRegistration = !!actor.user && ['admin','organizer'].includes(actor.user.role);
    const guestToken = managedRegistration ? token() : actor.user ? null : actor.guestToken || token();
    const guestHash = guestToken ? await hash(guestToken) : null;
    const userId = managedRegistration ? null : actor.user?.id || null;
    const ownerUserId = actor.user?.id || null;
    const regId = id();
    const result = await env.DB.prepare(`INSERT INTO registrations(id,event_id,departure_id,user_id,owner_user_id,guest_hash,name,name_key,category,car,car_preferences,car_any,status,preferred_pilot,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM events WHERE id=? AND version=?`).bind(regId,event.id,departure.id,userId,ownerUserId,guestHash,data.name,data.nameKey,data.category,data.car,JSON.stringify(data.cars),data.carAny?1:0,data.status,data.preferredPilot,now(),event.id,event.version).run();
    if (!result.meta.changes) fail(409, 'Cet événement a changé. Actualise avant de t’inscrire.');
    return json({id:regId, recoveryLink:guestToken ? canonical + '/#access=' + guestToken : null}, 201, guestToken ? [setCookie(COOKIE_GUEST, guestToken, 365 * DAY)] : []);
  }
  const regMatch = path.match(/^\/api\/registrations\/([a-f0-9-]{36})$/);
  if (regMatch && ['PATCH','DELETE'].includes(method)) {
    const reg = await env.DB.prepare('SELECT * FROM registrations WHERE id=?').bind(regMatch[1]).first();
    if (!reg) fail(404, 'Inscription introuvable.');
    if (!owned(reg,actor) && actor.user?.role !== 'admin') fail(403, 'Cette inscription ne t’appartient pas. Utilise ton lien personnel ou ton compte Discord.');
    const event = await eventById(env, reg.event_id), departure = departureById(event,reg.departure_id);
    if (departure.startsAt <= Date.now()) fail(409, 'Ce départ est passé. Les inscriptions sont verrouillées.');
    const input = await body(request);
    if (input.version !== reg.version) fail(409, 'Cette inscription a changé. Actualise la page.');
    let result;
    if (method === 'DELETE') result = await env.DB.prepare('DELETE FROM registrations WHERE id=? AND version=?').bind(reg.id,input.version).run();
    else {
      const data = validateRegistration(input,event);
      result = await env.DB.prepare(`UPDATE registrations SET name=?,name_key=?,category=?,car=?,car_preferences=?,car_any=?,status=?,preferred_pilot=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM events WHERE id=? AND version=?)`).bind(data.name,data.nameKey,data.category,data.car,JSON.stringify(data.cars),data.carAny?1:0,data.status,data.preferredPilot,reg.id,input.version,event.id,event.version).run();
    }
    if (!result.meta.changes) fail(409, 'Les données ont changé. Actualise avant de réessayer.');
    return json({ok:true});
  }
  if (path === '/api/members' && method === 'GET') {
    requireRole(actor.user,true);
    const rows = (await env.DB.prepare('SELECT * FROM users ORDER BY name LIMIT 200').all()).results;
    return json({members:rows.map(u => publicUser(u,env))});
  }
  const memberMatch = path.match(/^\/api\/members\/(\d{15,22})$/);
  if (memberMatch && method === 'PATCH') {
    requireRole(actor.user,true);
    if (administrators(env).includes(memberMatch[1])) fail(403, 'Les administrateurs principaux sont définis dans la configuration du site.');
    const input = await body(request);
    if (!['pilot','organizer'].includes(input.role)) fail(400, 'Rôle invalide.');
    const result = await env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(input.role,memberMatch[1]).run();
    if (!result.meta.changes) fail(404, 'Ce pilote doit d’abord se connecter avec Discord.');
    return json({ok:true});
  }
  fail(404, 'Action introuvable.');
}
export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await api(request, env); }
    catch (error) {
      if (error instanceof HttpError) return json({error:error.message},error.status);
      const message=String(error.message);
      if (message.includes('UNIQUE constraint failed: crew_members.')) return json({error:'Ce pilote appartient déjà à un équipage sur ce départ. Actualise la page.'},409);
      if (message.includes('crew_category_in_use')) return json({error:'Ce pilote est affecté à un équipage de cette catégorie. Retire d’abord son affectation pour changer de catégorie.'},409);
      if (message.includes('crew_event_in_use')) return json({error:'Un équipage utilise encore ce départ ou cette catégorie. Supprime ou modifie cet équipage avant de continuer.'},409);
      if (message.includes('crew_membership_invalid') || message.includes('crew_invalid')) return json({error:'Affectation impossible : vérifie le départ, la catégorie et la disponibilité du pilote, puis actualise.'},409);
      if (message.includes('UNIQUE constraint failed: registrations.event_id, registrations.departure_id, registrations.user_id') ||
          message.includes('UNIQUE constraint failed: registrations.event_id, registrations.departure_id, registrations.guest_hash')) {
        return json({error:'La base utilise encore l’ancien schéma d’inscription. Applique la migration 0011_multi_category_registrations.sql une seule fois, puis recharge le site.'},503);
      }
      if (String(error.message).includes('UNIQUE constraint failed: registrations.')) return json({error:'Une inscription existe déjà pour ce pilote ou ce pseudo sur ce départ. Actualise pour retrouver la tienne.'},409);
      console.error('FMT API failure', error instanceof Error ? error.message.replace(/[a-f0-9]{64}/g,'[redacted]') : 'unknown');
      return json({error:'Le service est momentanément indisponible. Tes changements ne sont pas confirmés ; réessaie dans un instant.'},503);
    }
  }
};
