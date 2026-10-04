// Crew preparation (migration 0046, module "preparation"): in the crew's card, the common setup the manager shares,
// and for each pilot a short checklist with his lap time and consumption. Only the crew and its manager see it.
import {fail, json, now, body, registrationSelect, personal} from './core.mjs';
import {PREPARATION_CHECKS} from '../shared/crew-preparation.mjs';
const SETUP_LIMIT = 200000;
// LMU setups are .svm files, iRacing setups .sto files.
const SETUP_EXTENSION = {lmu:'svm', iracing:'sto'};
const gameOf = event => String(event?.circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';
export const preparationEnabled = community => community?.modules?.preparation === true;

const all = async (env, sql, ...params) => (await env.DB.prepare(sql).bind(...params).all()).results || [];

// The crews of the race page with their preparation, for the crews the player is in or manages (listEvents).
// `crews`: [{row, registrationIds, canManage}] of the site's community; `mine`: the player's own registration ids.
export async function crewPreparations(env, community, crews, mine) {
  const shown = crews.filter(item => item.canManage || item.registrationIds.some(id => mine.has(id)));
  const result = new Map();
  if (!preparationEnabled(community) || !shown.length) return result;
  const ids = JSON.stringify(shown.map(item => item.row.id));
  const setups = await all(env, 'SELECT crew_id,name,car,updated_at FROM crew_setups WHERE crew_id IN (SELECT value FROM json_each(?))', ids);
  const pilots = await all(env, 'SELECT crew_id,registration_id,checks,lap_ms,fuel FROM crew_preparation WHERE crew_id IN (SELECT value FROM json_each(?))', ids);
  for (const item of shown) {
    const setup = setups.find(row => row.crew_id === item.row.id);
    const entries = {};
    for (const row of pilots) if (row.crew_id === item.row.id && item.registrationIds.includes(row.registration_id))
      entries[row.registration_id] = {checks:JSON.parse(row.checks || '[]'), lapMs:row.lap_ms ?? null, fuel:row.fuel ?? null};
    result.set(item.row.id, {setup:setup ? {name:setup.name, car:setup.car || '', updatedAt:setup.updated_at} : null, pilots:entries});
  }
  return result;
}

// Body of a setup upload, read up to the limit.
async function fileBody(request) {
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Fichier manquant.');
  let size = 0; const chunks = [];
  while (true) { const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > SETUP_LIMIT) { await reader.cancel(); fail(413, 'Setup trop lourd (200 Ko au plus).'); } chunks.push(value); }
  if (!size) fail(400, 'Fichier vide.');
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return all;
}

export function validatePreparation(input) {
  const checks = Array.isArray(input.checks) ? [...new Set(input.checks)] : null;
  if (!checks || checks.some(key => !PREPARATION_CHECKS.includes(key))) fail(400, 'Préparation invalide.');
  const lapMs = input.lapMs ?? null, fuel = input.fuel ?? null;
  if (lapMs !== null && (!Number.isInteger(lapMs) || lapMs < 20000 || lapMs > 1800000)) fail(400, 'Indique un tour entre 0:20 et 30:00, par exemple 1:54.300.');
  if (fuel !== null && (typeof fuel !== 'number' || !Number.isFinite(fuel) || fuel <= 0 || fuel > 100)) fail(400, 'Indique une consommation entre 0 et 100 par tour.');
  return {checks:PREPARATION_CHECKS.filter(key => checks.includes(key)), lapMs, fuel:fuel === null ? null : Math.round(fuel * 100) / 100};
}

// /api/crews/:id/setup (GET, PUT, DELETE) and /api/crews/:id/preparation/:registrationId (PUT).
export async function crewPreparationApi(path, method, request, env, actor, community, canManageCrew) {
  const match = path.match(/^\/api\/crews\/([a-f0-9-]{36})\/(setup|preparation\/([a-f0-9-]{36}))$/);
  if (!match) return null;
  if (!preparationEnabled(community)) fail(404, 'La préparation n’est pas activée dans cette communauté.');
  if (!actor.user) fail(401, 'Connecte-toi avec Discord.');
  const crew = await env.DB.prepare('SELECT * FROM crews WHERE id=? AND community_id=?').bind(match[1], community.id).first();
  if (!crew) fail(404, 'Équipage introuvable.');
  const members = await all(env, registrationSelect + ' JOIN crew_members cm ON cm.registration_id=r.id WHERE cm.crew_id=?', crew.id);
  const manager = canManageCrew(crew, actor);
  if (!manager && !members.some(reg => personal(reg, actor))) fail(403, 'La préparation est réservée aux pilotes de l’équipage.');

  if (match[2] === 'setup') {
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT name,bytes FROM crew_setups WHERE crew_id=?').bind(crew.id).first();
      if (!row) fail(404, 'Aucun setup pour cet équipage.');
      return new Response(new Uint8Array(row.bytes), {headers:{'Content-Type':'application/octet-stream', 'Content-Disposition':`attachment; filename="${row.name}"`,
        'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff'}});
    }
    if (!['PUT', 'DELETE'].includes(method)) fail(405, 'Méthode non prise en charge.');
    if (!manager) fail(403, 'Seul le responsable de l’équipage partage le setup.');
    if (method === 'DELETE') { await env.DB.prepare('DELETE FROM crew_setups WHERE crew_id=?').bind(crew.id).run(); return json({ok:true}); }
    const event = await env.DB.prepare('SELECT circuit FROM events WHERE id=?').bind(crew.event_id).first();
    const extension = SETUP_EXTENSION[gameOf(event)];
    let name = String(request.headers.get('X-Setup-Name') || '');
    try { name = decodeURIComponent(name); } catch { fail(400, 'Nom de fichier invalide.'); }
    name = name.split(/[\\/]/).pop().trim();
    if (!new RegExp(`\\.${extension}$`, 'i').test(name)) fail(400, `Envoie un setup .${extension}.`);
    // Only plain characters in the file name sent back (Content-Disposition).
    const safe = name.replace(/[^A-Za-z0-9_. -]/g, '_').slice(-100);
    const bytes = await fileBody(request);
    await env.DB.prepare(`INSERT INTO crew_setups(crew_id,name,bytes,car,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(crew_id) DO UPDATE SET name=excluded.name,bytes=excluded.bytes,car=excluded.car,updated_at=excluded.updated_at`).bind(crew.id, safe, bytes, crew.car || null, now()).run();
    return json({ok:true});
  }

  if (method !== 'PUT') fail(405, 'Méthode non prise en charge.');
  const registration = members.find(reg => reg.id === match[3]);
  if (!registration) fail(409, 'Ce pilote ne fait plus partie de l’équipage. Actualise la page.');
  // Each pilot fills in his own preparation.
  if (!personal(registration, actor)) fail(403, 'Chaque pilote remplit sa propre préparation.');
  const data = validatePreparation(await body(request));
  await env.DB.prepare(`INSERT INTO crew_preparation(crew_id,registration_id,checks,lap_ms,fuel,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(crew_id,registration_id) DO UPDATE SET checks=excluded.checks,lap_ms=excluded.lap_ms,fuel=excluded.fuel,updated_at=excluded.updated_at`)
    .bind(crew.id, registration.id, JSON.stringify(data.checks), data.lapMs, data.fuel, now()).run();
  return json({ok:true});
}
