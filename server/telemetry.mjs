import {json, origin, fail, identity} from './core.mjs';

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
      online INTEGER NOT NULL DEFAULT 1
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_client_errors_created_at ON client_errors(created_at DESC)')
  ]);
}

async function readClientErrors(env) {
  await ensureClientErrorsTable(env);
  const cutoff=Math.floor(Date.now()/1000)-14*DAY;
  await env.DB.prepare('DELETE FROM client_errors WHERE created_at < ?').bind(cutoff).run();
  return (await env.DB.prepare(`SELECT created_at,kind,page,api_path,method,message,detail,user_agent,viewport,online
    FROM client_errors ORDER BY created_at DESC LIMIT 200`).all()).results;
}

export async function ingestClientError(request,env) {
  if (!env.DB) return new Response(null,{status:204});
  const url=new URL(request.url);
  const canonical=origin(env);
  const requestOrigin=request.headers.get('Origin');
  if (url.origin!==canonical || (requestOrigin && requestOrigin!==canonical)) return new Response(null,{status:204});
  if (request.method!=='POST') return new Response(null,{status:405});
  let input;
  try {
    const raw=await request.text();
    if (raw.length>8192) return new Response(null,{status:413});
    input=JSON.parse(raw||'{}');
  } catch { return new Response(null,{status:204}); }
  const createdAt=Math.floor(Date.now()/1000);
  try {
    await ensureClientErrorsTable(env);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO client_errors(id,created_at,kind,page,api_path,method,message,detail,user_agent,viewport,online)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(
          crypto.randomUUID(),createdAt,clean(input.kind||'network',40),clean(input.page,160),clean(input.apiPath,160),clean(input.method,12),clean(input.message,500),clean(input.detail,1000),clean(input.userAgent,500),clean(input.viewport,40),input.online===false?0:1
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

export async function clientErrorsApi(path,method,env,actor) {
  if (path!=='/api/client-errors') return null;
  if (method!=='GET') fail(405,'Méthode non autorisée.');
  if (!actor.user || !['admin','organizer'].includes(actor.user.role)) fail(403,'Accès réservé aux organisateurs et administrateurs.');
  return json({errors:await readClientErrors(env)});
}

export async function clientErrorsTelemetry(request,env) {
  if (!env.DB) return json({error:'La base partagée n’est pas encore configurée.'},503);
  if (request.method!=='GET') return json({error:'Méthode non autorisée.'},405);
  const url=new URL(request.url);
  const canonical=origin(env);
  if (url.origin!==canonical) return json({error:'Utilise l’adresse principale du site pour cette action.'},403);
  const actor=await identity(request,env);
  if (!actor.user || !['admin','organizer'].includes(actor.user.role)) return json({error:'Accès réservé aux organisateurs et administrateurs.'},403);
  return json({errors:await readClientErrors(env)});
}
