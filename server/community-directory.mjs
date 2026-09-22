import {fail,json,origin,rateLimit,id,now,text} from './core.mjs';
import {discordBotInviteUrl,discordEligibility,inspectDiscordGuild,requireDiscordCommunityAccess} from './community-discord.mjs';

const UUID=/^[a-f0-9-]{36}$/;
const DISCORD_ID=/^\d{15,22}$/;
const GAMES=new Set(['lmu','iracing']);
const JOIN_MODES=new Set(['open','request','invite','discord']);
const VISIBILITIES=new Set(['public','private']);

function orgId(value){
  const result=String(value||'');
  if(!UUID.test(result))fail(400,'Organisation invalide.');
  return result;
}
function nameKey(value){return String(value||'').normalize('NFKC').trim().toLocaleLowerCase('fr-FR');}
function parseGames(value){
  try{const parsed=JSON.parse(value||'[]');if(Array.isArray(parsed)&&parsed.length)return parsed.filter(game=>GAMES.has(game));}catch{}
  return ['lmu','iracing'];
}
function games(value){
  const result=[...new Set((Array.isArray(value)?value:['lmu','iracing']).map(String).filter(game=>GAMES.has(game)))];
  if(!result.length)fail(400,'Choisis au moins un simulateur.');
  return result;
}
function joinMode(value){
  const result=String(value||'open');
  if(!JOIN_MODES.has(result))fail(400,'Mode d’accès invalide.');
  return result;
}
function visibility(value){
  const result=String(value||'public');
  if(!VISIBILITIES.has(result))fail(400,'Visibilité invalide.');
  return result;
}
function language(value){
  const result=String(value||'fr').toLowerCase();
  if(!['fr','en'].includes(result))fail(400,'Langue invalide.');
  return result;
}
async function secureWrite(request,env){
  const canonical=origin(env),url=new URL(request.url);
  if(url.origin!==canonical)fail(403,'Utilise l’adresse principale du site pour cette action.');
  if(request.headers.get('Origin')!==canonical)fail(403,'Origine de la requête refusée.');
  await rateLimit(request,env,'write',80);
}

export async function membership(env,userId,organizationId){
  if(!userId||!organizationId)return null;
  return env.DB.prepare('SELECT o.*,m.role FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE o.id=? AND m.user_id=?')
    .bind(organizationId,userId).first();
}
export async function requireMember(env,actor,organizationId,{manage=false}={}){
  const member=await membership(env,actor.user?.id,orgId(organizationId));
  if(!actor.user)fail(401,'Connecte-toi avec Discord pour utiliser cette organisation.');
  if(!member)fail(403,'Tu ne fais pas partie de cette organisation.');
  if(manage&&!['owner','manager'].includes(member.role))fail(403,'Seul un responsable de cette organisation peut faire cette action.');
  return member;
}

async function membersFor(env,ids){
  const map=new Map();
  if(!ids.length)return map;
  const marks=ids.map(()=>'?').join(',');
  const rows=(await env.DB.prepare('SELECT om.organization_id,om.user_id,om.role,u.name FROM organization_members om JOIN users u ON u.id=om.user_id WHERE om.organization_id IN ('+marks+') ORDER BY CASE om.role WHEN \'owner\' THEN 0 WHEN \'manager\' THEN 1 ELSE 2 END,lower(u.name),u.id').bind(...ids).all()).results||[];
  for(const row of rows){
    if(!map.has(row.organization_id))map.set(row.organization_id,[]);
    map.get(row.organization_id).push({id:row.user_id,name:row.name,role:row.role});
  }
  return map;
}
async function memberCountsFor(env,ids){
  const map=new Map();
  if(!ids.length)return map;
  const marks=ids.map(()=>'?').join(',');
  const rows=(await env.DB.prepare('SELECT organization_id,COUNT(*) member_count FROM organization_members WHERE organization_id IN ('+marks+') GROUP BY organization_id').bind(...ids).all()).results||[];
  for(const row of rows)map.set(row.organization_id,Number(row.member_count)||0);
  return map;
}
async function activityFor(env,ids){
  const map=new Map();
  if(!ids.length)return map;
  const marks=ids.map(()=>'?').join(',');
  const sql='SELECT organization_id,event_id FROM (SELECT organization_id,id event_id FROM events WHERE organization_id IN ('+marks+') UNION SELECT ra.organization_id organization_id,r.event_id event_id FROM registration_audiences ra JOIN registrations r ON r.id=ra.registration_id WHERE ra.organization_id IN ('+marks+') UNION SELECT c.organization_id organization_id,c.event_id event_id FROM crews c WHERE c.organization_id IN ('+marks+')) ORDER BY organization_id,event_id';
  const rows=(await env.DB.prepare(sql).bind(...ids,...ids,...ids).all()).results||[];
  for(const row of rows){
    if(!map.has(row.organization_id))map.set(row.organization_id,[]);
    if(!map.get(row.organization_id).includes(row.event_id))map.get(row.organization_id).push(row.event_id);
  }
  return map;
}
async function requestsFor(env,ids){
  const map=new Map();
  if(!ids.length)return map;
  const marks=ids.map(()=>'?').join(',');
  const rows=(await env.DB.prepare('SELECT r.organization_id,r.user_id,r.created_at,u.name FROM organization_join_requests r JOIN users u ON u.id=r.user_id WHERE r.organization_id IN ('+marks+') ORDER BY r.created_at,u.name').bind(...ids).all()).results||[];
  for(const row of rows){
    if(!map.has(row.organization_id))map.set(row.organization_id,[]);
    map.get(row.organization_id).push({id:row.user_id,name:row.name,createdAt:Number(row.created_at)||0});
  }
  return map;
}
function present(row,extra={}){
  const community=row.type==='community';
  return {
    id:row.id,type:row.type,name:row.name,
    description:community?String(row.description||''):'',
    language:community?String(row.language||'fr'):'fr',
    games:community?parseGames(row.games):[],
    visibility:community?String(row.visibility||'public'):'private',
    joinMode:community?String(row.join_mode||'open'):'invite',
    ownerUserId:row.owner_user_id,
    role:extra.role||null,
    memberCount:Number(extra.memberCount)||0,
    members:extra.members||[],
    eventIds:extra.eventIds||[],
    joinRequests:extra.manage?(extra.joinRequests||[]):[],
    joinPending:Boolean(extra.joinPending),
    discord:community?{
      linked:Boolean(row.discord_guild_id),
      guildId:extra.manage?String(row.discord_guild_id||''):'',
      guildName:String(row.discord_guild_name||''),
      requiredRoleId:extra.manage?String(row.discord_role_id||''):'',
      requiredRoleName:String(row.discord_role_name||''),
      joinRequired:String(row.join_mode||'open')==='discord'
    }:{linked:false,guildId:'',guildName:'',requiredRoleId:'',requiredRoleName:'',joinRequired:false}
  };
}

export async function organizationSummary(env,actor){
  const joined=actor.user?(await env.DB.prepare('SELECT o.*,m.role FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=? ORDER BY o.type DESC,lower(o.name),o.id').bind(actor.user.id).all()).results||[]:[];
  const joinedIds=joined.map(item=>item.id);
  const managedIds=joined.filter(item=>['owner','manager'].includes(item.role)).map(item=>item.id);
  const team=joined.find(item=>item.type==='team');
  const [teamMembers,memberCounts,joinedActivity,requestMap]=await Promise.all([
    membersFor(env,team?[team.id]:[]),
    memberCountsFor(env,joinedIds),
    activityFor(env,joinedIds),
    requestsFor(env,managedIds)
  ]);
  let discoverable=[];
  if(actor.user){
    discoverable=(await env.DB.prepare('SELECT o.*,COUNT(om.user_id) member_count,EXISTS(SELECT 1 FROM organization_join_requests r WHERE r.organization_id=o.id AND r.user_id=?) join_pending FROM organizations o LEFT JOIN organization_members om ON om.organization_id=o.id WHERE o.type=\'community\' AND o.visibility=\'public\' AND NOT EXISTS(SELECT 1 FROM organization_members mine WHERE mine.organization_id=o.id AND mine.user_id=?) GROUP BY o.id ORDER BY lower(o.name),o.id').bind(actor.user.id,actor.user.id).all()).results||[];
  }else{
    discoverable=(await env.DB.prepare('SELECT o.*,COUNT(om.user_id) member_count,0 join_pending FROM organizations o LEFT JOIN organization_members om ON om.organization_id=o.id WHERE o.type=\'community\' AND o.visibility=\'public\' GROUP BY o.id ORDER BY lower(o.name),o.id').all()).results||[];
  }
  const discoverActivity=await activityFor(env,discoverable.map(item=>item.id));
  const decorate=item=>{
    const manage=['owner','manager'].includes(item.role);
    const members=item.type==='team'?(teamMembers.get(item.id)||[]):[];
    return present(item,{role:item.role,members,memberCount:memberCounts.get(item.id)||0,eventIds:joinedActivity.get(item.id)||[],manage,joinRequests:requestMap.get(item.id)||[]});
  };
  return {
    team:team?decorate(team):null,
    communities:joined.filter(item=>item.type==='community').map(decorate),
    discoverableCommunities:discoverable.map(item=>present(item,{memberCount:Number(item.member_count)||0,eventIds:discoverActivity.get(item.id)||[],joinPending:Boolean(item.join_pending)})),
    discordBotReady:Boolean(env.DISCORD_BOT_TOKEN),
    discordBotInviteUrl:discordBotInviteUrl(env)
  };
}

async function createOrganization(request,env,actor){
  await secureWrite(request,env);
  if(!actor.user)fail(401,'Connecte-toi avec Discord pour créer une organisation.');
  const input=await request.clone().json().catch(()=>null);
  if(!input||!['team','community'].includes(input.type))fail(400,'Choisis Team ou communauté.');
  const name=text(input.name,60,input.type==='team'?'Nom de la Team':'Nom de la communauté');
  if(input.type==='team'){
    const existing=await env.DB.prepare('SELECT 1 FROM organization_members om JOIN organizations o ON o.id=om.organization_id WHERE om.user_id=? AND o.type=\'team\' LIMIT 1').bind(actor.user.id).first();
    if(existing)fail(409,'Tu fais déjà partie d’une Team.');
  }
  const community=input.type==='community';
  const description=community&&typeof input.description==='string'&&input.description.trim()?text(input.description,600,'Présentation'):'';
  const selectedGames=community?games(input.games):['lmu','iracing'];
  const selectedMode=community?joinMode(input.joinMode):'invite';
  if(selectedMode==='discord')fail(409,'Crée d’abord la communauté, puis lie son serveur Discord.');
  const organizationId=id(),createdAt=now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO organizations(id,type,name,name_key,owner_user_id,description,language,games,visibility,join_mode,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(organizationId,input.type,name,nameKey(name),actor.user.id,description,community?language(input.language):'fr',JSON.stringify(selectedGames),community?visibility(input.visibility):'private',selectedMode,createdAt,createdAt),
    env.DB.prepare('INSERT INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,\'owner\',?)').bind(organizationId,actor.user.id,createdAt)
  ]);
  return json({id:organizationId},201);
}
async function updateCommunity(request,env,actor,organizationId){
  await secureWrite(request,env);
  const member=await requireMember(env,actor,organizationId,{manage:true});
  if(member.type!=='community')fail(400,'Cette fiche concerne uniquement les communautés.');
  const input=await request.clone().json().catch(()=>null);if(!input)fail(400,'Formulaire invalide.');
  const name=text(input.name,60,'Nom de la communauté');
  const description=typeof input.description==='string'&&input.description.trim()?text(input.description,600,'Présentation'):'';
  const mode=joinMode(input.joinMode);
  if(mode==='discord'&&!member.discord_guild_id)fail(409,'Lie d’abord un serveur Discord.');
  await env.DB.prepare('UPDATE organizations SET name=?,name_key=?,description=?,language=?,games=?,visibility=?,join_mode=?,updated_at=? WHERE id=?')
    .bind(name,nameKey(name),description,language(input.language),JSON.stringify(games(input.games)),visibility(input.visibility),mode,now(),member.id).run();
  return json({ok:true});
}
async function joinCommunity(request,env,actor,organizationId){
  await secureWrite(request,env);
  if(!actor.user)fail(401,'Connecte-toi avec Discord pour rejoindre une communauté.');
  const organization=await env.DB.prepare('SELECT * FROM organizations WHERE id=?').bind(orgId(organizationId)).first();
  if(!organization||organization.type!=='community')fail(404,'Communauté introuvable.');
  if(await membership(env,actor.user.id,organization.id))return json({ok:true,joined:true});
  const mode=organization.join_mode||'open';
  if(mode==='invite')fail(403,'Cette communauté se rejoint uniquement sur invitation.');
  if(mode==='request'){
    await env.DB.prepare('INSERT OR IGNORE INTO organization_join_requests(organization_id,user_id,created_at) VALUES(?,?,?)').bind(organization.id,actor.user.id,now()).run();
    return json({ok:true,pending:true});
  }
  if(mode==='discord')await requireDiscordCommunityAccess(env,actor.user.id,organization,{joining:true});
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,\'member\',?)').bind(organization.id,actor.user.id,now()),
    env.DB.prepare('DELETE FROM organization_join_requests WHERE organization_id=? AND user_id=?').bind(organization.id,actor.user.id)
  ]);
  return json({ok:true,joined:true});
}
async function configureDiscord(request,env,actor,organizationId){
  await secureWrite(request,env);
  const member=await requireMember(env,actor,organizationId,{manage:true});
  if(member.type!=='community')fail(400,'Discord se configure au niveau d’une communauté.');
  const input=await request.clone().json().catch(()=>null);if(!input)fail(400,'Formulaire invalide.');
  const guildId=String(input.guildId||'').trim();
  if(!guildId){
    if(member.join_mode==='discord')fail(409,'Choisis d’abord un autre mode d’accès avant de délier Discord.');
    await env.DB.prepare('UPDATE organizations SET discord_guild_id=NULL,discord_guild_name=NULL,discord_role_id=NULL,discord_role_name=NULL,updated_at=? WHERE id=?').bind(now(),member.id).run();
    return json({ok:true,cleared:true});
  }
  const guild=await inspectDiscordGuild(env,actor.user.id,guildId);
  const roleId=String(input.roleId||'').trim();
  const role=roleId?guild.roles.find(item=>item.id===roleId):null;
  if(roleId&&!role)fail(400,'Choisis un rôle présent sur ce serveur.');
  await env.DB.prepare('UPDATE organizations SET discord_guild_id=?,discord_guild_name=?,discord_role_id=?,discord_role_name=?,updated_at=? WHERE id=?')
    .bind(guild.id,guild.name,role?.id||null,role?.name||null,now(),member.id).run();
  return json({ok:true,guild,requiredRole:role||null});
}
async function decideRequest(request,env,actor,organizationId,userId){
  await secureWrite(request,env);
  const organization=await requireMember(env,actor,organizationId,{manage:true});
  const input=await request.clone().json().catch(()=>null);
  if(!['approve','deny'].includes(input?.action))fail(400,'Décision invalide.');
  const pending=await env.DB.prepare('SELECT 1 FROM organization_join_requests WHERE organization_id=? AND user_id=?').bind(organization.id,userId).first();
  if(!pending)fail(404,'Cette demande n’est plus en attente.');
  if(input.action==='approve'){
    if(organization.join_mode==='discord')await requireDiscordCommunityAccess(env,userId,organization,{joining:true});
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,\'member\',?)').bind(organization.id,userId,now()),
      env.DB.prepare('DELETE FROM organization_join_requests WHERE organization_id=? AND user_id=?').bind(organization.id,userId)
    ]);
  }else await env.DB.prepare('DELETE FROM organization_join_requests WHERE organization_id=? AND user_id=?').bind(organization.id,userId).run();
  return json({ok:true});
}

export async function communityDirectoryApi(request,env,actor){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(path==='/api/organizations'&&method==='GET')return json(await organizationSummary(env,actor));
  if(path==='/api/organizations'&&method==='POST')return createOrganization(request,env,actor);

  const profile=path.match(/^\/api\/organizations\/([a-f0-9-]{36})$/);
  if(profile&&method==='PATCH')return updateCommunity(request,env,actor,profile[1]);

  const join=path.match(/^\/api\/organizations\/([a-f0-9-]{36})\/join$/);
  if(join&&method==='POST')return joinCommunity(request,env,actor,join[1]);

  const leave=path.match(/^\/api\/organizations\/([a-f0-9-]{36})\/members\/me$/);
  if(leave&&method==='DELETE'){
    await secureWrite(request,env);
    const member=await requireMember(env,actor,leave[1]);
    if(member.role==='owner')fail(409,'Le créateur doit conserver l’organisation.');
    await env.DB.prepare('DELETE FROM organization_members WHERE organization_id=? AND user_id=?').bind(member.id,actor.user.id).run();
    return json({ok:true});
  }

  const members=path.match(/^\/api\/organizations\/([a-f0-9-]{36})\/members(?:\/(\d{15,22}))?$/);
  if(members&&method==='GET'&&!members[2]){
    const organization=await requireMember(env,actor,members[1]);
    const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||50));
    const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
    const list=(await env.DB.prepare('SELECT om.user_id,om.role,u.name FROM organization_members om JOIN users u ON u.id=om.user_id WHERE om.organization_id=? ORDER BY CASE om.role WHEN \'owner\' THEN 0 WHEN \'manager\' THEN 1 ELSE 2 END,lower(u.name),u.id LIMIT ? OFFSET ?').bind(organization.id,limit,offset).all()).results||[];
    const count=await env.DB.prepare('SELECT COUNT(*) total FROM organization_members WHERE organization_id=?').bind(organization.id).first();
    const total=Number(count?.total)||0;
    return json({members:list.map(row=>({id:row.user_id,name:row.name,role:row.role})),total,nextOffset:offset+list.length<total?offset+list.length:null});
  }
  if(members&&method==='POST'&&!members[2]){
    await secureWrite(request,env);
    const organization=await requireMember(env,actor,members[1],{manage:true});
    const input=await request.clone().json().catch(()=>null),userId=String(input?.userId||'');
    if(!DISCORD_ID.test(userId))fail(400,'Sélectionne un pilote Discord.');
    if(!(await env.DB.prepare('SELECT 1 FROM users WHERE id=?').bind(userId).first()))fail(404,'Ce pilote doit d’abord s’être connecté à Endurance Manager.');
    if(organization.type==='community'&&organization.join_mode==='discord')await requireDiscordCommunityAccess(env,userId,organization,{joining:true});
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,\'member\',?)').bind(organization.id,userId,now()),
      env.DB.prepare('DELETE FROM organization_join_requests WHERE organization_id=? AND user_id=?').bind(organization.id,userId)
    ]);
    return json({ok:true});
  }
  if(members&&method==='DELETE'&&members[2]){
    await secureWrite(request,env);
    const organization=await requireMember(env,actor,members[1],{manage:true});
    const target=await env.DB.prepare('SELECT role FROM organization_members WHERE organization_id=? AND user_id=?').bind(organization.id,members[2]).first();
    if(!target)fail(404,'Ce pilote ne fait plus partie de cette organisation.');
    if(target.role==='owner')fail(409,'Le créateur ne peut pas être retiré.');
    await env.DB.prepare('DELETE FROM organization_members WHERE organization_id=? AND user_id=?').bind(organization.id,members[2]).run();
    return json({ok:true});
  }

  const requestDecision=path.match(/^\/api\/organizations\/([a-f0-9-]{36})\/join-requests\/(\d{15,22})$/);
  if(requestDecision&&method==='POST')return decideRequest(request,env,actor,requestDecision[1],requestDecision[2]);

  const discord=path.match(/^\/api\/organizations\/([a-f0-9-]{36})\/discord$/);
  if(discord&&method==='GET'){
    await requireMember(env,actor,discord[1],{manage:true});
    const guildId=String(url.searchParams.get('guildId')||'').trim();
    if(!guildId)fail(400,'Indique l’identifiant du serveur Discord.');
    return json(await inspectDiscordGuild(env,actor.user.id,guildId));
  }
  if(discord&&method==='PATCH')return configureDiscord(request,env,actor,discord[1]);

  const eligibility=path.match(/^\/api\/organizations\/([a-f0-9-]{36})\/eligibility$/);
  if(eligibility&&method==='GET'){
    if(!actor.user)fail(401,'Connecte-toi avec Discord pour vérifier ton statut.');
    const organization=await env.DB.prepare('SELECT * FROM organizations WHERE id=? AND type=\'community\'').bind(eligibility[1]).first();
    if(!organization)fail(404,'Communauté introuvable.');
    const status=await discordEligibility(env,actor.user.id,organization);
    return json({...status,isCommunityMember:Boolean(await membership(env,actor.user.id,organization.id)),requiredRoleName:String(organization.discord_role_name||''),guildName:String(organization.discord_guild_name||'')});
  }
  return null;
}

export async function requireOrganizationEligibility(env,userId,organizationId){
  const organization=await env.DB.prepare('SELECT * FROM organizations WHERE id=?').bind(orgId(organizationId)).first();
  if(!organization)fail(404,'Organisation introuvable.');
  if(organization.type==='community'&&(organization.discord_role_id||organization.join_mode==='discord'))await requireDiscordCommunityAccess(env,userId,organization);
  return organization;
}
