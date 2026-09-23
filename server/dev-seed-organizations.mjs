import {identity,now} from './core.mjs';

const DEV_ORIGIN='https://app.endurance-manager.workers.dev';
const DEV_ORGANIZATIONS=[
  {id:'c0000000-0000-4000-8000-000000000001',name:'Les Tondeuz à gazon',nameKey:'les tondeuz à gazon'}
];

async function ensureOrganization(env,user,definition){
  let organization=await env.DB.prepare("SELECT id,owner_user_id FROM organizations WHERE id=? OR (type='community' AND name_key=?) ORDER BY CASE WHEN name_key=? THEN 0 ELSE 1 END LIMIT 1")
    .bind(definition.id,definition.nameKey,definition.nameKey).first();
  const createdAt=now();
  if(!organization){
    await env.DB.prepare("INSERT INTO organizations(id,type,name,name_key,owner_user_id,visibility,join_mode,created_at) VALUES(?,'community',?,?,?,'private','invite',?)")
      .bind(definition.id,definition.name,definition.nameKey,user.id,createdAt).run();
    organization={id:definition.id,owner_user_id:user.id};
  }else if(organization.id===definition.id){
    await env.DB.prepare("UPDATE organizations SET type='community',name=?,name_key=?,visibility='private',join_mode='invite' WHERE id=?")
      .bind(definition.name,definition.nameKey,definition.id).run();
  }
  const existing=await env.DB.prepare('SELECT role FROM organization_members WHERE organization_id=? AND user_id=?')
    .bind(organization.id,user.id).first();
  if(existing)return;
  const role=organization.owner_user_id===user.id?'owner':'member';
  await env.DB.prepare('INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,?,?)')
    .bind(organization.id,user.id,role,createdAt).run();
}

export async function ensureDevOrganizations(request,env){
  if(!env?.DB||env?.APP_ORIGIN!==DEV_ORIGIN)return;
  const url=new URL(request.url);
  if(url.origin!==DEV_ORIGIN)return;
  const pathname=url.pathname;
  if(pathname!=='/api/session'&&!pathname.startsWith('/api/organizations'))return;
  const actor=await identity(request,env);
  if(!actor.user||!['admin','organizer'].includes(actor.user.role))return;
  for(const definition of DEV_ORGANIZATIONS)await ensureOrganization(env,actor.user,definition);
}
