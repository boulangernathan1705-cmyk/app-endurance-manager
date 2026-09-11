import {CATEGORIES, EVENT_TYPE_IDS as EVENT_TYPES, CIRCUIT_IDS as CIRCUITS, CARS} from '../shared/catalog.mjs';
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
  return !!((actor.user && (reg.participant_user_id === actor.user.id || reg.user_id === actor.user.id || reg.owner_user_id === actor.user.id)) ||
    (actor.guestHash && reg.guest_hash === actor.guestHash));
}
function personal(reg, actor) {
  return !!((actor.user && (reg.participant_user_id === actor.user.id || reg.user_id === actor.user.id)) ||
    (!actor.user && !reg.participant_created_by && actor.guestHash && reg.participant_guest_hash === actor.guestHash));
}
const registrationSelect = `SELECT r.*,p.user_id AS participant_user_id,p.guest_hash AS participant_guest_hash,
 p.created_by AS participant_created_by,p.name AS participant_name FROM registrations r JOIN participants p ON p.id=r.participant_id`;
async function registrationParticipant(env, actor, input, data) {
  const manager=!!actor.user && ['admin','organizer'].includes(actor.user.role);
  if (input.participantUserId) {
    if (!actor.user) fail(401,'Connecte-toi avec Discord pour inscrire un autre pilote.');
    if (!/^\d{15,22}$/.test(input.participantUserId)) fail(400,'Compte Discord invalide.');
    const discordUser=await env.DB.prepare('SELECT id,name FROM users WHERE id=?').bind(input.participantUserId).first();
    if (!discordUser) fail(404,'Ce pilote Discord est introuvable. Actualise la page.');
    data.name=discordUser.name;
    data.nameKey=data.name.normalize('NFKC').toLocaleLowerCase('fr-FR');
    await env.DB.prepare(`INSERT INTO participants(id,name,user_id,created_by,created_at) VALUES(?,?,?,?,?)
      ON CONFLICT(user_id) WHERE user_id IS NOT NULL DO UPDATE SET name=excluded.name`).bind(id(),discordUser.name,discordUser.id,actor.user.id,now()).run();
    return env.DB.prepare('SELECT * FROM participants WHERE user_id=?').bind(discordUser.id).first();
  }
  if (input.participantId) {
    const participant=await env.DB.prepare('SELECT * FROM participants WHERE id=?').bind(input.participantId).first();
    if (!participant) fail(404,'Ce pilote est introuvable. Actualise la page.');
    const existing=await env.DB.prepare(registrationSelect+' WHERE r.participant_id=?').bind(participant.id).all();
    const self=!!(actor.user && participant.user_id===actor.user.id) || !!(actor.guestHash && participant.guest_hash===actor.guestHash);
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
      WHERE user_id IS NULL AND guest_hash IS NULL AND created_by=? AND lower(name)=lower(?)
      ORDER BY created_at,id LIMIT 1`).bind(actor.user.id,data.name).first();
    if (existing) return existing;
    const participant={id:id(),name:data.name,user_id:null,guest_hash:null,created_by:actor.user.id};
    await env.DB.prepare('INSERT INTO participants(id,name,created_by,created_at) VALUES(?,?,?,?)').bind(participant.id,participant.name,actor.user.id,now()).run();
    return participant;
  }
  if (actor.user) {
    await env.DB.prepare('INSERT INTO participants(id,name,user_id,created_by,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) WHERE user_id IS NOT NULL DO NOTHING').bind(id(),data.name,actor.user.id,actor.user.id,now()).run();
    return env.DB.prepare('SELECT * FROM participants WHERE user_id=?').bind(actor.user.id).first();
  }
  await env.DB.prepare('INSERT INTO participants(id,name,guest_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(guest_hash) WHERE guest_hash IS NOT NULL DO NOTHING').bind(id(),data.name,actor.guestHash,now()).run();
  return env.DB.prepare('SELECT * FROM participants WHERE guest_hash=?').bind(actor.guestHash).first();
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

export {
  LEGACY_CAR_ALIASES, COOKIE_SESSION, COOKIE_GUEST, COOKIE_STATE, DAY, HttpError, fail, now, id, token, hash, cookie,
  setCookie, json, redirect, origin, requireDiscord, administrators, publicUser, requireRole, identity, owned, personal,
  registrationSelect, registrationParticipant, body, rateLimit, cleanup, text, parisTimestamp, validateEvent, validateRegistration
};
