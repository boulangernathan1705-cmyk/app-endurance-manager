import {
  HttpError,fail,json,origin,rateLimit,identity,id,now,text,registrationSelect,personal
} from './core.mjs';

const UUID=/^[a-f0-9-]{36}$/;
const DISCORD_ID=/^\d{15,22}$/;
const GENERAL='general';
const orgId=value=>typeof value==='string'&&value?value:null;
const nameKey=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase('fr-FR');
const audienceKey=organizationId=>organizationId||GENERAL;

async function secureWrite(request,env){
  const canonical=origin(env),url=new URL(request.url);
  if(url.origin!==canonical)fail(403,'Utilise l’adresse principale du site pour cette action.');
  if(request.headers.get('Origin')!==canonical)fail(403,'Origine de la requête refusée.');
  await rateLimit(request,env,'write',80);
}

async function membership(env,userId,organizationId){
  if(!userId||!organizationId)return null;
  return env.DB.prepare(`SELECT o.id,o.type,o.name,o.owner_user_id,m.role
    FROM organizations o JOIN organization_members m ON m.organization_id=o.id
    WHERE o.id=? AND m.user_id=?`).bind(organizationId,userId).first();
}

async function requireMember(env,actor,organizationId,{manage=false}={}){
  if(!UUID.test(String(organizationId||'')))fail(400,'Organisation invalide.');
  if(!actor.user)fail(401,'Connecte-toi avec Discord pour utiliser une Team ou une communauté.');
  const member=await membership(env,actor.user.id,organizationId);
  if(!member)fail(403,'Tu ne fais pas partie de cette Team ou communauté.');
  if(manage&&!['owner','manager'].includes(member.role))fail(403,'Seul un responsable de cette organisation peut faire cette action.');
  return member;
}

async function membersFor(env,organizationIds){
  if(!organizationIds.length)return new Map();
  const marks=organizationIds.map(()=>'?').join(',');
  const rows=(await env.DB.prepare(`SELECT om.organization_id,om.user_id,om.role,u.name
    FROM organization_members om JOIN users u ON u.id=om.user_id
    WHERE om.organization_id IN (${marks})
    ORDER BY CASE om.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,lower(u.name),u.id`).bind(...organizationIds).all()).results||[];
  const map=new Map();
  for(const row of rows){
    if(!map.has(row.organization_id))map.set(row.organization_id,[]);
    map.get(row.organization_id).push({id:row.user_id,name:row.name,role:row.role});
  }
  return map;
}

export async function organizationSummary(env,actor){
  const empty={team:null,communities:[],discoverableCommunities:[]};
  if(!actor.user)return empty;
  const joined=(await env.DB.prepare(`SELECT o.id,o.type,o.name,o.owner_user_id,m.role
    FROM organizations o JOIN organization_members m ON m.organization_id=o.id
    WHERE m.user_id=? ORDER BY o.type DESC,lower(o.name),o.id`).bind(actor.user.id).all()).results||[];
  const members=await membersFor(env,joined.map(item=>item.id));
  const decorate=item=>({
    id:item.id,type:item.type,name:item.name,role:item.role,ownerUserId:item.owner_user_id,
    members:members.get(item.id)||[],memberCount:(members.get(item.id)||[]).length
  });
  const discoverable=(await env.DB.prepare(`SELECT o.id,o.name,o.owner_user_id,COUNT(om.user_id) AS member_count
    FROM organizations o LEFT JOIN organization_members om ON om.organization_id=o.id
    WHERE o.type='community' AND NOT EXISTS(
      SELECT 1 FROM organization_members mine WHERE mine.organization_id=o.id AND mine.user_id=?
    ) GROUP BY o.id,o.name,o.owner_user_id ORDER BY lower(o.name),o.id`).bind(actor.user.id).all()).results||[];
  const team=joined.find(item=>item.type==='team');
  return {
    team:team?decorate(team):null,
    communities:joined.filter(item=>item.type==='community').map(decorate),
    discoverableCommunities:discoverable.map(item=>({id:item.id,type:'community',name:item.name,ownerUserId:item.owner_user_id,memberCount:Number(item.member_count)||0}))
  };
}

async function organizationsApi(request,env,actor){
  const {pathname:path}=new URL(request.url),method=request.method;
  if(path==='/api/organizations'&&method==='GET'){
    if(!actor.user)fail(401,'Connecte-toi avec Discord pour gérer tes groupes.');
    return json(await organizationSummary(env,actor));
  }
  if(path==='/api/organizations'&&method==='POST'){
    await secureWrite(request,env);
    if(!actor.user)fail(401,'Connecte-toi avec Discord pour créer une Team ou une communauté.');
    const input=await request.clone().json().catch(()=>null);
    if(!input||!['team','community'].includes(input.type))fail(400,'Choisis Team ou communauté.');
    const name=text(input.name,60,input.type==='team'?'Nom de la Team':'Nom de la communauté');
    if(input.type==='team'){
      const existing=await env.DB.prepare(`SELECT 1 FROM organization_members om JOIN organizations o ON o.id=om.organization_id
        WHERE om.user_id=? AND o.type='team' LIMIT 1`).bind(actor.user.id).first();
      if(existing)fail(409,'Tu fais déjà partie d’une Team. Un pilote ne peut avoir qu’une seule Team.');
    }
    const organizationId=id(),createdAt=now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO organizations(id,type,name,name_key,owner_user_id,created_at) VALUES(?,?,?,?,?,?)').bind(organizationId,input.type,name,nameKey(name),actor.user.id,createdAt),
      env.DB.prepare("INSERT INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,'owner',?)").bind(organizationId,actor.user.id,createdAt)
    ]);
    return json({id:organizationId},201);
  }
  const join=path.match(/^\/api\/organizations\/([a-f0-9-]{36})\/join$/);
  if(join&&method==='POST'){
    await secureWrite(request,env);
    if(!actor.user)fail(401,'Connecte-toi avec Discord pour rejoindre une communauté.');
    const organization=await env.DB.prepare('SELECT id,type FROM organizations WHERE id=?').bind(join[1]).first();
    if(!organization)fail(404,'Communauté introuvable.');
    if(organization.type!=='community')fail(403,'Une Team privée se rejoint uniquement sur invitation.');
    await env.DB.prepare("INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,'member',?)").bind(organization.id,actor.user.id,now()).run();
    return json({ok:true});
  }
  const leave=path.match(/^\/api\/organizations\/([a-f0-9-]{36})\/members\/me$/);
  if(leave&&method==='DELETE'){
    await secureWrite(request,env);
    const member=await requireMember(env,actor,leave[1]);
    if(member.role==='owner')fail(409,'Le créateur doit conserver l’organisation. Le transfert ou la suppression pourra être ajouté plus tard.');
    await env.DB.prepare('DELETE FROM organization_members WHERE organization_id=? AND user_id=?').bind(leave[1],actor.user.id).run();
    return json({ok:true});
  }
  const add=path.match(/^\/api\/organizations\/([a-f0-9-]{36})\/members$/);
  if(add&&method==='POST'){
    await secureWrite(request,env);
    const member=await requireMember(env,actor,add[1],{manage:true});
    if(member.type!=='team')fail(400,'Une communauté est ouverte : le pilote peut la rejoindre lui-même.');
    const input=await request.clone().json().catch(()=>null),userId=String(input?.userId||'');
    if(!DISCORD_ID.test(userId))fail(400,'Sélectionne un pilote Discord.');
    if(!(await env.DB.prepare('SELECT 1 FROM users WHERE id=?').bind(userId).first()))fail(404,'Ce pilote doit d’abord s’être connecté à Endurance Manager.');
    await env.DB.prepare("INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,created_at) VALUES(?,?,'member',?)").bind(add[1],userId,now()).run();
    return json({ok:true});
  }
  const remove=path.match(/^\/api\/organizations\/([a-f0-9-]{36})\/members\/(\d{15,22})$/);
  if(remove&&method==='DELETE'){
    await secureWrite(request,env);
    await requireMember(env,actor,remove[1],{manage:true});
    const target=await env.DB.prepare('SELECT role FROM organization_members WHERE organization_id=? AND user_id=?').bind(remove[1],remove[2]).first();
    if(!target)fail(404,'Ce pilote ne fait plus partie de cette organisation.');
    if(target.role==='owner')fail(409,'Le créateur de l’organisation ne peut pas être retiré.');
    await env.DB.prepare('DELETE FROM organization_members WHERE organization_id=? AND user_id=?').bind(remove[1],remove[2]).run();
    return json({ok:true});
  }
  return null;
}

function eventDeparture(path,suffix){
  const match=path.match(new RegExp(`^/api/events/([a-f0-9-]{36})/departures/([a-f0-9-]{36})/${suffix}$`));
  return match?{eventId:match[1],departureId:match[2]}:null;
}

async function loadEventDeparture(env,{eventId,departureId}){
  const event=await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(eventId).first();
  if(!event)fail(404,'Événement introuvable.');
  const departure=JSON.parse(event.departures).find(item=>item.id===departureId);
  if(!departure)fail(404,'Départ introuvable.');
  if(Number(departure.startsAt)<=Date.now())fail(409,'Ce départ est passé. Les inscriptions sont fermées.');
  return {event,departure};
}

async function targetUserId(env,actor,input){
  if(input?.participantUserId&&DISCORD_ID.test(String(input.participantUserId)))return String(input.participantUserId);
  if(input?.participantId&&UUID.test(String(input.participantId))){
    const participant=await env.DB.prepare('SELECT user_id FROM participants WHERE id=?').bind(input.participantId).first();
    return participant?.user_id||null;
  }
  if(input?.forOther===true)return null;
  return actor.user?.id||null;
}

function normalizeAudienceIds(input){
  const source=Array.isArray(input?.audienceIds)
    ? input.audienceIds
    : input?.organizationId
      ? [input.organizationId]
      : [GENERAL];
  if(!source.length||source.length>20)fail(400,'Choisis au moins un espace de partage.');
  const ids=[...new Set(source.map(value=>String(value||'').trim()).filter(Boolean))];
  if(!ids.length||ids.length>20||ids.some(value=>value!==GENERAL&&!UUID.test(value)))fail(400,'Espace de partage invalide.');
  return ids;
}

async function validateAudiences(env,actor,input,{participantUserId=null}={}){
  const ids=normalizeAudienceIds(input);
  const organizations=ids.filter(value=>value!==GENERAL);
  if(!organizations.length)return ids;
  if(!actor.user)fail(401,'Connecte-toi avec Discord pour partager une inscription avec une Team ou une communauté.');
  for(const organizationId of organizations){
    if(!(await membership(env,actor.user.id,organizationId)))fail(403,'Tu ne peux partager une inscription qu’avec tes propres groupes.');
    if(!participantUserId)fail(409,'Pour une Team ou une communauté, sélectionne un pilote membre connecté à Discord.');
    if(!(await membership(env,participantUserId,organizationId)))fail(409,'Ce pilote ne fait pas partie d’un des groupes sélectionnés.');
  }
  return ids;
}

async function requiredCrewAudience(env,registrationId){
  const row=await env.DB.prepare(`SELECT c.organization_id
    FROM crew_members cm JOIN crews c ON c.id=cm.crew_id
    WHERE cm.registration_id=? LIMIT 1`).bind(registrationId).first();
  return row?audienceKey(row.organization_id):null;
}

async function replaceAudiences(env,registrationId,ids){
  const required=await requiredCrewAudience(env,registrationId);
  if(required&&!ids.includes(required))fail(409,'Cette inscription est déjà affectée à un équipage dans cet espace. Retire-la d’abord de l’équipage.');
  const createdAt=now();
  const statements=ids.map(key=>env.DB.prepare(`INSERT OR IGNORE INTO registration_audiences(registration_id,audience_key,organization_id,created_at)
    VALUES(?,?,?,?)`).bind(registrationId,key,key===GENERAL?null:key,createdAt));
  const marks=ids.map(()=>'?').join(',');
  statements.push(env.DB.prepare(`DELETE FROM registration_audiences WHERE registration_id=? AND audience_key NOT IN (${marks})`).bind(registrationId,...ids));
  await env.DB.batch(statements);
}

async function createCrew(request,env,actor,ids,input,organizationId){
  await secureWrite(request,env);
  const member=await requireMember(env,actor,organizationId);
  const {event,departure}=await loadEventDeparture(env,ids);
  const name=text(input.name,60,'Nom de l’équipage');
  if(!JSON.parse(event.categories).includes(input.category))fail(400,'Choisis une catégorie de cet événement.');
  const car=input.car==null||input.car===''?'':text(input.car,100,'Voiture');
  const crewId=id(),manager=['owner','manager'].includes(member.role);
  if(manager){
    await env.DB.prepare('INSERT INTO crews(id,event_id,departure_id,name,category,car,owner_user_id,organization_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(crewId,event.id,departure.id,name,input.category,car,actor.user.id,organizationId,now()).run();
    return json({id:crewId,joined:false},201);
  }
  const own=(await env.DB.prepare(registrationSelect+` JOIN registration_audiences ra ON ra.registration_id=r.id
    WHERE r.event_id=? AND r.departure_id=? AND r.category=? AND r.status!=? AND ra.audience_key=?`).bind(event.id,departure.id,input.category,'unavailable',organizationId).all()).results||[];
  const selected=own.find(reg=>personal(reg,actor));
  if(!selected)fail(403,'Partage d’abord ta disponibilité avec cette organisation sur ce départ avant de créer ton équipage.');
  const results=await env.DB.batch([
    env.DB.prepare('INSERT INTO crews(id,event_id,departure_id,name,category,car,owner_user_id,organization_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(crewId,event.id,departure.id,name,input.category,car,actor.user.id,organizationId,now()),
    env.DB.prepare('INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE changes()=1').bind(selected.id,crewId)
  ]);
  if(!results[0].meta.changes)fail(409,'Impossible de créer cet équipage. Actualise avant de réessayer.');
  return json({id:crewId,joined:true,removedRegistrations:0},201);
}

async function accessibleOrganizations(env,actor){
  if(!actor.user)return new Set();
  const rows=(await env.DB.prepare('SELECT organization_id FROM organization_members WHERE user_id=?').bind(actor.user.id).all()).results||[];
  return new Set(rows.map(row=>row.organization_id));
}

async function decorateEvents(response,env,actor){
  if(!response.ok)return response;
  const data=await response.clone().json().catch(()=>null);
  if(!data||!Array.isArray(data.events)||!data.events.length)return response;
  const eventIds=data.events.map(event=>event.id),marks=eventIds.map(()=>'?').join(',');
  const [registrationRows,audienceRows,crewRows,engagedRows,allowed]=await Promise.all([
    env.DB.prepare(`SELECT id,organization_id FROM registrations WHERE event_id IN (${marks})`).bind(...eventIds).all(),
    env.DB.prepare(`SELECT a.registration_id,a.audience_key,a.organization_id
      FROM registration_audiences a JOIN registrations r ON r.id=a.registration_id
      WHERE r.event_id IN (${marks})`).bind(...eventIds).all(),
    env.DB.prepare(`SELECT id,organization_id FROM crews WHERE event_id IN (${marks})`).bind(...eventIds).all(),
    env.DB.prepare(`SELECT cm.registration_id FROM crew_members cm JOIN crews c ON c.id=cm.crew_id
      WHERE c.event_id IN (${marks})`).bind(...eventIds).all(),
    accessibleOrganizations(env,actor)
  ]);
  const directOrg=new Map((registrationRows.results||[]).map(row=>[row.id,row.organization_id||null]));
  const audiences=new Map();
  for(const row of audienceRows.results||[]){
    if(!audiences.has(row.registration_id))audiences.set(row.registration_id,[]);
    audiences.get(row.registration_id).push(row.audience_key);
  }
  const crewOrg=new Map((crewRows.results||[]).map(row=>[row.id,row.organization_id||null]));
  const engaged=new Set((engagedRows.results||[]).map(row=>row.registration_id));
  const canSeeAudience=key=>key===GENERAL||allowed.has(key);
  const canSeeCrew=organizationId=>!organizationId||allowed.has(organizationId);
  for(const event of data.events){
    for(const departure of event.departures||[]){
      departure.availability=(departure.availability||[]).flatMap(reg=>{
        const all=audiences.get(reg.id)||[audienceKey(directOrg.get(reg.id)||null)];
        const visible=[...new Set(all.filter(canSeeAudience))];
        return visible.length?[{...reg,audienceIds:visible,engaged:engaged.has(reg.id)}]:[];
      });
      departure.crews=(departure.crews||[]).flatMap(crew=>{
        const organizationId=crewOrg.get(crew.id)||null;
        return canSeeCrew(organizationId)?[{...crew,organizationId}]:[];
      });
    }
  }
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.delete('Content-Length');
  return new Response(JSON.stringify(data),{status:response.status,headers});
}

async function decorateSession(response,env,actor){
  if(!response.ok)return response;
  const data=await response.clone().json().catch(()=>null);if(!data)return response;
  data.organizations=await organizationSummary(env,actor);
  const headers=new Headers(response.headers);headers.delete('Content-Length');
  return new Response(JSON.stringify(data),{status:response.status,headers});
}

async function route(request,env,ctx,next){
  const {pathname:path}=new URL(request.url),method=request.method;
  const needsActor=path==='/api/session'||path==='/api/events'||path.startsWith('/api/organizations')||path.startsWith('/api/registrations/')||path.startsWith('/api/crews/')||/\/registrations$/.test(path)||/\/crews$/.test(path);
  const actor=needsActor?await identity(request,env):null;

  if(path.startsWith('/api/organizations')){
    const response=await organizationsApi(request,env,actor);if(response)return response;
  }

  const registrationIds=method==='POST'?eventDeparture(path,'registrations'):null;
  if(registrationIds){
    const input=await request.clone().json().catch(()=>null);if(!input)fail(400,'Formulaire invalide.');
    const participantUserId=await targetUserId(env,actor,input);
    const audienceIds=await validateAudiences(env,actor,input,{participantUserId});
    const response=await next(request,env,ctx);
    if(!response.ok)return response;
    const result=await response.clone().json().catch(()=>null);
    if(!result?.id)return response;
    try{await replaceAudiences(env,result.id,audienceIds);}
    catch(error){
      try{await env.DB.prepare('DELETE FROM registrations WHERE id=?').bind(result.id).run();}catch{}
      throw error;
    }
    return response;
  }

  const registration=path.match(/^\/api\/registrations\/([a-f0-9-]{36})$/);
  if(registration&&method==='PATCH'){
    const input=await request.clone().json().catch(()=>null);if(!input)fail(400,'Formulaire invalide.');
    let audienceIds=null;
    if(Array.isArray(input.audienceIds)){
      const row=await env.DB.prepare(registrationSelect+' WHERE r.id=?').bind(registration[1]).first();
      if(!row)fail(404,'Inscription introuvable.');
      audienceIds=await validateAudiences(env,actor,input,{participantUserId:row.participant_user_id||row.user_id||null});
      const required=await requiredCrewAudience(env,row.id);
      if(required&&!audienceIds.includes(required))fail(409,'Cette inscription est déjà affectée à un équipage dans cet espace. Retire-la d’abord de l’équipage.');
    }
    const response=await next(request,env,ctx);
    if(response.ok&&audienceIds)await replaceAudiences(env,registration[1],audienceIds);
    return response;
  }

  const crewIds=method==='POST'?eventDeparture(path,'crews'):null;
  if(crewIds){
    const input=await request.clone().json().catch(()=>null);if(!input)fail(400,'Formulaire invalide.');
    const organizationId=orgId(input.organizationId);
    if(input.organizationId&&(!organizationId||!UUID.test(organizationId)))fail(400,'Organisation invalide.');
    if(organizationId)return createCrew(request,env,actor,crewIds,input,organizationId);
  }

  const crew=path.match(/^\/api\/crews\/([a-f0-9-]{36})/);
  if(crew&&['POST','PATCH','DELETE'].includes(method)){
    const row=await env.DB.prepare('SELECT organization_id FROM crews WHERE id=?').bind(crew[1]).first();
    if(row?.organization_id)await requireMember(env,actor,row.organization_id);
  }

  const addCrewMember=method==='POST'?path.match(/^\/api\/crews\/([a-f0-9-]{36})\/members$/):null;
  if(addCrewMember){
    const input=await request.clone().json().catch(()=>null);if(!input)fail(400,'Formulaire invalide.');
    if(!UUID.test(String(input.registrationId||'')))fail(400,'Sélectionne un pilote inscrit.');
    const row=await env.DB.prepare(`SELECT c.organization_id,
      EXISTS(SELECT 1 FROM registration_audiences a WHERE a.registration_id=? AND a.audience_key=COALESCE(c.organization_id,'general')) AS shared
      FROM crews c WHERE c.id=?`).bind(input.registrationId,addCrewMember[1]).first();
    if(row&&!Number(row.shared))fail(409,'Ce pilote n’a pas partagé sa disponibilité avec l’espace de cet équipage.');
  }

  let response=await next(request,env,ctx);
  if(path==='/api/session'&&method==='GET')response=await decorateSession(response,env,actor);
  if(path==='/api/events'&&method==='GET')response=await decorateEvents(response,env,actor);
  return response;
}

export async function organizationAwareFetch(request,env,ctx,next){
  try{return await route(request,env,ctx,next);}
  catch(error){
    if(error instanceof HttpError)return json({error:error.message},error.status);
    const message=String(error?.message||error);
    if(message.includes('one_team_only'))return json({error:'Un pilote ne peut appartenir qu’à une seule Team.'},409);
    if(message.includes('crew_membership_audience'))return json({error:'Ce pilote doit partager sa disponibilité avec cet espace avant de rejoindre cet équipage.'},409);
    if(message.includes('audience_in_use'))return json({error:'Cette inscription est utilisée par un équipage dans cet espace. Retire-la d’abord de l’équipage.'},409);
    if(message.includes('organization_fixed'))return json({error:'L’organisation d’un équipage ne peut pas être changée après sa création.'},409);
    if(message.includes('UNIQUE constraint failed: organizations.'))return json({error:'Une organisation de ce type utilise déjà ce nom.'},409);
    console.error('Organization API failure',error instanceof Error?error.message:'unknown');
    return json({error:'Impossible de gérer les groupes pour le moment.'},503);
  }
}
