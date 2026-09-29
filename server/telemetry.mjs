import {json, siteOrigin, fail, identity, rateLimit} from './core.mjs';
import {currentCommunity} from './community.mjs';

const DAY=86400;
const clean=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);

async function ensureClientErrorsTable(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS client_errors (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      page TEXT NOT NULL DEFAULT '',
      api_path TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      viewport TEXT NOT NULL DEFAULT '',
      online INTEGER NOT NULL DEFAULT 1,
      community_id TEXT NOT NULL DEFAULT ''
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_client_errors_created_at ON client_errors(created_at DESC)')
  ]);
}

// Errors of one community only (its organizers and admins read them on the diagnostics page).
async function readClientErrors(env, community) {
  await ensureClientErrorsTable(env);
  const cutoff=Math.floor(Date.now()/1000)-14*DAY;
  await env.DB.prepare('DELETE FROM client_errors WHERE created_at < ?').bind(cutoff).run();
  return (await env.DB.prepare(`SELECT created_at,kind,page,api_path,method,message,detail,user_agent,viewport,online
    FROM client_errors WHERE community_id=? ORDER BY created_at DESC LIMIT 200`).bind(community.id).all()).results;
}

export async function ingestClientError(request,env) {
  if (!env.DB) return request.method==='GET' ? json({error:'La base partagée n’est pas encore configurée.'},503) : new Response(null,{status:204});
  const url=new URL(request.url);
  const canonical=siteOrigin(request,env);
  const requestOrigin=request.headers.get('Origin');
  if (url.origin!==canonical || requestOrigin!==canonical) return request.method==='GET' ? json({error:'Utilise l’adresse principale du site pour cette action.'},403) : new Response(null,{status:204});

  // Reading goes through /api/client-errors (community permissions); this address only receives reports.
  if (request.method==='GET') return json({error:'Action introuvable.'},404);
  if (request.method!=='POST') return new Response(null,{status:405});
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('text/plain')) return new Response(null,{status:415});
  await rateLimit(request,env,'telemetry',30);

  let input;
  try {
    const raw=await request.text();
    if (raw.length>8192) return new Response(null,{status:413});
    input=JSON.parse(raw||'{}');
  } catch { return new Response(null,{status:204}); }
  const createdAt=Math.floor(Date.now()/1000);
  try {
    await ensureClientErrorsTable(env);
    const community=await currentCommunity(env, request);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO client_errors(id,created_at,kind,page,api_path,method,message,detail,user_agent,viewport,online,community_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          crypto.randomUUID(),createdAt,clean(input.kind||'network',40),clean(input.page,160),clean(input.apiPath,160),clean(input.method,12),clean(input.message,500),clean(input.detail,1000),clean(input.userAgent,500),clean(input.viewport,40),input.online===false?0:1,community.id
        ),
      env.DB.prepare('DELETE FROM client_errors WHERE created_at < ?').bind(createdAt-14*DAY)
    ]);
    const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM client_errors').first();
    if (Number(count?.total)>500) await env.DB.prepare('DELETE FROM client_errors WHERE id IN (SELECT id FROM client_errors ORDER BY created_at DESC LIMIT -1 OFFSET 500)').run();
  } catch (error) {
    console.error('Client telemetry failure',String(error?.message||error||'unknown').slice(0,200));
  }
  return new Response(null,{status:204});
}

export async function clientErrorsApi(path,method,env,actor,community) {
  if (path!=='/api/client-errors') return null;
  if (method!=='GET') fail(405,'Méthode non autorisée.');
  if (!actor.user || !(actor.permissions?.has('admin') || actor.permissions?.has('manage_races'))) fail(403,'Accès réservé aux organisateurs et administrateurs.');
  return json({errors:await readClientErrors(env, community)});
}
