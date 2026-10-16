import {fail, json, body, now, hash, token, DAY, rateLimit} from './core.mjs';
import {isDevelopment} from './dev-environment.mjs';
import {communityById} from './community.mjs';
import {communityAccess} from './access.mjs';
import {catalogForGame} from '../shared/catalog.mjs';
import {SCOPE_FIELDS, scopeKey, pitKey, cleanMetrics, cleanPitProfile, collective, pilotSummary} from '../shared/memo.mjs';
import {parseReference, REFERENCE_SOURCE} from '../shared/memo-reference.mjs';

const catalog = catalogForGame('lmu');
const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
// Preview available on dev. Production requires explicit activation by its community.
export const memoEnabled = (env, community) => community?.modules?.memo === true || isDevelopment(env) && community?.modules?.memo !== false;

export function cleanScope(input) {
  const scope = {};
  for (const key of SCOPE_FIELDS) {
    if (typeof input?.[key] !== 'string' || !input[key].trim() || input[key].length > 100) fail(400, `Contexte manquant ou invalide : ${key}.`);
    scope[key] = input[key].trim();
  }
  if (!catalog.circuits.some(item => item.id === scope.circuit && !item.random) || !Object.values(catalog.cars).some(cars => cars.includes(scope.car)) || !['dry','wet','unknown'].includes(scope.weather)) fail(400, 'Circuit, voiture ou conditions inconnus.');
  return scope;
}

function badInput(fn) { try { return fn(); } catch (error) { fail(400,error.message); } }
async function contributor(env, userId) { return userId ? env.DB.prepare('SELECT consent_at FROM memo_contributors WHERE user_id=?').bind(userId).first() : null; }

export async function memoApi(path, method, request, env, actor, community) {
  if (!path.startsWith('/api/memo')) return null;
  if (!memoEnabled(env, community)) fail(404,'Le mémo n’est pas activé dans cette communauté.');
  if (!actor.user) fail(401,'Connecte-toi avec Discord.');
  const own = await contributor(env,actor.user.id);
  if (path === '/api/memo' && method === 'GET') {
    const scopes = await all(env, 'SELECT scope, MAX(started_at) AS latest FROM memo_samples WHERE started_at>=? GROUP BY scope_key ORDER BY latest DESC LIMIT 300',now()-90*DAY);
    const ref = await env.DB.prepare("SELECT data,fetched_at FROM memo_reference WHERE id='laptimes'").first();
    return json({contributing:!!own, connectorReady:env.MEMO_CONNECTOR_READY === 'true', scopes:scopes.map(row => JSON.parse(row.scope)),
      reference:ref ? {...JSON.parse(ref.data), fetchedAt:ref.fetched_at, source:REFERENCE_SOURCE.name, url:REFERENCE_SOURCE.url} : null,
      link:own ? await env.DB.prepare('SELECT expires_at,last_seen FROM memo_links WHERE user_id=?').bind(actor.user.id).first() : null});
  }
  if (path === '/api/memo/sheet' && method === 'GET') {
    const scope = cleanScope(Object.fromEntries(new URL(request.url).searchParams));
    // Bound output: at most five sessions per pilot and 1500 sessions for this exact scope.
    const rows = (await all(env, `SELECT user_id,metrics,started_at FROM (
      SELECT user_id,metrics,started_at,ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY started_at DESC,session_id) AS n
      FROM memo_samples WHERE scope_key=? AND started_at>=?) WHERE n<=5 ORDER BY started_at DESC LIMIT 1500`,scopeKey(scope),now()-90*DAY))
      .map(row => ({...row,metrics:JSON.parse(row.metrics)}));
    const personalRows = own ? (await all(env,'SELECT metrics,started_at FROM memo_samples WHERE user_id=? AND scope_key=? AND started_at>=? ORDER BY started_at DESC,session_id LIMIT 5',actor.user.id,scopeKey(scope),now()-90*DAY)).map(row => ({...row,metrics:JSON.parse(row.metrics)})) : [];
    const profile = await env.DB.prepare('SELECT profile,verified_at FROM memo_pit_profiles WHERE scope_key=?').bind(pitKey(scope)).first();
    return json({scope, contributing:!!own, personal:own ? pilotSummary(personalRows) : null,
      collective:collective(rows,own ? actor.user.id : null), latest:rows[0]?.started_at || null,
      pit:profile ? {...JSON.parse(profile.profile),verifiedAt:profile.verified_at} : null});
  }
  if (path === '/api/memo/consent' && method === 'POST') {
    const input = await body(request);
    if (input.accept !== true) fail(400,'Confirme le partage de tes mesures dans les moyennes anonymes.');
    await env.DB.prepare('INSERT OR IGNORE INTO memo_contributors(user_id,consent_at) VALUES(?,?)').bind(actor.user.id,now()).run();
    return json({ok:true});
  }
  if (path === '/api/memo/consent' && method === 'DELETE') {
    // Cascade deletes the key and personal samples; future averages no longer include them.
    await env.DB.prepare('DELETE FROM memo_contributors WHERE user_id=?').bind(actor.user.id).run();
    return json({ok:true});
  }
  if (path === '/api/memo/link' && method === 'POST') {
    if (!own) fail(403,'Active d’abord le partage de tes données.');
    if (env.MEMO_CONNECTOR_READY !== 'true') fail(409,'La liaison LMU / SimHub doit encore être validée sur PC.');
    const secret = token();
    await env.DB.prepare(`INSERT INTO memo_links(user_id,community_id,token_hash,expires_at) VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET community_id=excluded.community_id,token_hash=excluded.token_hash,expires_at=excluded.expires_at,last_seen=NULL`)
      .bind(actor.user.id,community.id,await hash(secret),now()+90*DAY).run();
    return json({token:secret,expiresAt:now()+90*DAY});
  }
  if (path === '/api/memo/link' && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM memo_links WHERE user_id=?').bind(actor.user.id).run();
    return json({ok:true});
  }
  if (path === '/api/memo/pit-profile' && method === 'PUT') {
    if (!actor.manager) fail(403,'La validation des mesures de référence est réservée aux gestionnaires de la plateforme.');
    const input = await body(request), scope = cleanScope(input.scope), profile = badInput(() => cleanPitProfile(input.profile));
    await env.DB.prepare(`INSERT INTO memo_pit_profiles(scope_key,profile,verified_at,verified_by) VALUES(?,?,?,?)
      ON CONFLICT(scope_key) DO UPDATE SET profile=excluded.profile,verified_at=excluded.verified_at,verified_by=excluded.verified_by`)
      .bind(pitKey(scope),JSON.stringify(profile),now(),actor.user.id).run();
    return json({ok:true});
  }
  fail(404,'Action mémo introuvable.');
}

// Connector contract only: no browser session and never an identity supplied in the body.
export async function memoCollector(request, env) {
  if (request.method !== 'POST') fail(405,'Envoi POST requis.');
  const secret = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (!secret) fail(401,'Liaison requise.');
  await rateLimit(request,env,'memo-collector',20);
  const link = await env.DB.prepare('SELECT * FROM memo_links WHERE token_hash=? AND expires_at>?').bind(await hash(secret),now()).first();
  if (!link) fail(401,'Liaison expirée ou retirée.');
  if (link.last_seen && link.last_seen > now()-30) fail(429,'Attends 30 secondes entre deux envois.');
  const community = await communityById(env,link.community_id);
  if (!community || !memoEnabled(env,community)) fail(403,'Le mémo est désactivé.');
  const access = await communityAccess(env,{user:{id:link.user_id}},community);
  if (access.status !== 'member') fail(403,'Accès à la communauté retiré.');
  const input = await body(request), scope = cleanScope(input.scope);
  if (input.schema !== 1 || typeof input.sessionId !== 'string' || !/^[A-Za-z0-9_.:-]{1,100}$/.test(input.sessionId) || !Number.isInteger(input.startedAt) || input.startedAt < now()-90*DAY || input.startedAt > now()+300) fail(400,'Séance invalide ou trop ancienne.');
  const metrics = badInput(() => cleanMetrics(input.metrics));
  // Same session cannot be overwritten by retries or reassigned to a different scope.
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO memo_samples(user_id,session_id,scope_key,scope,metrics,started_at,received_at) VALUES(?,?,?,?,?,?,?)').bind(link.user_id,input.sessionId,scopeKey(scope),JSON.stringify(scope),JSON.stringify(metrics),input.startedAt,now()),
    env.DB.prepare('UPDATE memo_links SET last_seen=? WHERE user_id=?').bind(now(),link.user_id),
    env.DB.prepare('DELETE FROM memo_samples WHERE user_id=? AND session_id NOT IN (SELECT session_id FROM memo_samples WHERE user_id=? ORDER BY started_at DESC,session_id LIMIT 100)').bind(link.user_id,link.user_id)
  ]);
  return json({ok:true});
}

export async function refreshMemoReference(env, fetcher = fetch) {
  const saved = await env.DB.prepare("SELECT attempted_at FROM memo_reference WHERE id='laptimes'").first();
  if (saved?.attempted_at > now()-DAY) return;
  await env.DB.prepare("INSERT INTO memo_reference(id,data,fetched_at,attempted_at) VALUES('laptimes','{}',0,?) ON CONFLICT(id) DO UPDATE SET attempted_at=excluded.attempted_at").bind(now()).run();
  const response = await fetcher(REFERENCE_SOURCE.csv,{signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error('Tableau de référence indisponible.');
  const reader = response.body.getReader(); let text = '', bytes = 0; const decoder = new TextDecoder();
  while (true) { const {done,value} = await reader.read(); if (done) break; bytes += value.length; if (bytes > 1_000_000) { await reader.cancel(); throw Error('Tableau trop volumineux.'); } text += decoder.decode(value,{stream:true}); }
  text += decoder.decode();
  const parsed = parseReference(text);
  if (parsed.entries.length < 3) throw Error('Structure du tableau de référence non reconnue.');
  await env.DB.prepare("UPDATE memo_reference SET data=?,fetched_at=? WHERE id='laptimes'").bind(JSON.stringify(parsed),now()).run();
}

export async function purgeMemo(env) {
  await env.DB.prepare('DELETE FROM memo_samples WHERE rowid IN (SELECT rowid FROM memo_samples WHERE started_at<? LIMIT 500)').bind(now()-90*DAY).run();
  await env.DB.prepare('DELETE FROM memo_links WHERE expires_at<?').bind(now()).run();
}
