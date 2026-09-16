import {identity,now} from './core.mjs';

const DEV_ORIGIN='https://app.endurance-manager.workers.dev';
const TEST_SPACES=[
  {id:'f0000000-0000-4000-8000-000000000001',type:'team',name:'FMT',nameKey:'fmt'},
  {id:'c0000000-0000-4000-8000-000000000001',type:'community',name:'Endurance Community',nameKey:'endurance community'}
];

async function organizationByName(env,type,nameKey){
  return env.DB.prepare('SELECT id FROM organizations WHERE type=? AND name_key=? LIMIT 1').bind(type,nameKey).first();
}

async function hasTeam(env,userId){
  return env.DB.prepare(`SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id=om.organization_id
    WHERE om.user_id=? AND o.type='team' LIMIT 1`).bind(userId).first();
}

async function createSpace(env,user,space){
  if(await organizationByName(env,space.type,space.nameKey))return;
  if(space.type==='team'&&await hasTeam(env,user.id))return;
  const createdAt=now();
  try{
    await env.DB.batch([
      env.DB.prepare('INSERT INTO organizations(id,type,name,name_key,owner_user_id,created_at) VALUES(?,?,?,?,?,?)')
        .bind(space.id,space.type,space.name,space.nameKey,user.id,createdAt),
      env.DB.prepare("INSERT INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,'owner',?)")
        .bind(space.id,user.id,createdAt)
    ]);
  }catch(error){
    const message=String(error?.message||error);
    if(message.includes('UNIQUE constraint failed: organizations.')||message.includes('one_team_only'))return;
    throw error;
  }
}

export async function ensureDevTestSpaces(request,env){
  if(env?.APP_ORIGIN!==DEV_ORIGIN||!env?.DB)return;
  const pathname=new URL(request.url).pathname;
  if(pathname!=='/api/session'&&!pathname.startsWith('/api/organizations'))return;
  const actor=await identity(request,env);
  const user=actor.user;
  if(!user||!['admin','organizer'].includes(user.role))return;
  for(const space of TEST_SPACES)await createSpace(env,user,space);
}
