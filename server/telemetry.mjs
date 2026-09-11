import {json, origin, fail} from './core.mjs';

const DAY=86400;
const clean=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);

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
  const cutoff=Math.floor(Date.now()/1000)-14*DAY;
  await env.DB.prepare('DELETE FROM client_errors WHERE created_at < ?').bind(cutoff).run();
  const rows=(await env.DB.prepare(`SELECT created_at,kind,page,api_path,method,message,detail,user_agent,viewport,online
    FROM client_errors ORDER BY created_at DESC LIMIT 200`).all()).results;
  return json({errors:rows});
}
