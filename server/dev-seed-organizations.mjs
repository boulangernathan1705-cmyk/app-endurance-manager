import {identity,now} from './core.mjs';

const DEV_ORIGIN='https://app.endurance-manager.workers.dev';
const DEV_ORGANIZATIONS=[
  {id:'f0000000-0000-4000-8000-000000000001',type:'team',name:'FMT',nameKey:'fmt'},
  {id:'c0000000-0000-4000-8000-000000000001',type:'community',name:'Endurance Community',nameKey:'endurance community'}
];

async function hasTeam(env,userId){
  return env.DB.prepare(`SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id=om.organization_id
    WHERE om.user_id=? AND o.type='team' LIMIT 1`).bind(userId).first();
}

async function ensureOrganization(env,user,definition){
  let organization=await env.DB.prepare('SELECT id,owner_user_id FROM organizations WHERE type=? AND name_key=? LIMIT 1')
    .bind(definition.type,definition.nameKey).first();
  const createdAt=now();
  if(!organization){
    if(definition.type==='team'&&await hasTeam(env,user.id))return;
    await env.DB.prepare('INSERT INTO organizations(id,type,name,name_key,owner_user_id,created_at) VALUES(?,?,?,?,?,?)')
      .bind(definition.id,definition.type,definition.name,definition.nameKey,user.id,createdAt).run();
    organization={id:definition.id,owner_user_id:user.id};
  }
  const existing=await env.DB.prepare('SELECT role FROM organization_members WHERE organization_id=? AND user_id=?')
    .bind(organization.id,user.id).first();
  if(existing)return;
  if(definition.type==='team'&&await hasTeam(env,user.id))return;
  const role=organization.owner_user_id===user.id?'owner':'member';
  await env.DB.prepare('INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,?,?)')
    .bind(organization.id,user.id,role,createdAt).run();
}

export async function ensureDevOrganizations(request,env){
  if(env?.APP_ORIGIN!==DEV_ORIGIN||!env?.DB)return;
  const pathname=new URL(request.url).pathname;
  if(pathname!=='/api/session'&&!pathname.startsWith('/api/organizations'))return;
  const actor=await identity(request,env);
  if(!actor.user||!['admin','organizer'].includes(actor.user.role))return;
  for(const definition of DEV_ORGANIZATIONS)await ensureOrganization(env,actor.user,definition);
}
