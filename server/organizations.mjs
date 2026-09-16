import {
  HttpError,fail,json,origin,rateLimit,identity,id,now,text,registrationSelect,
  registrationParticipant,validateRegistration,personal
} from './core.mjs';

const UUID=/^[a-f0-9-]{36}$/;
const DISCORD_ID=/^\d{15,22}$/;
const orgId=value=>typeof value==='string'&&value?value:null;
const nameKey=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase('fr-FR');

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
    if(!actor.user)fail(401,'Connecte-toi avec Discord pour gérer tes Teams et communautés.');
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

async function ensureParticipantMember(env,organizationId,participant){
  if(!participant?.user_id)fail(409,'Dans une Team ou une communauté, sélectionne un pilote membre connecté à Discord.');
  if(!(await membership(env,participant.user_id,organizationId)))fail(409,'Ce pilote ne fait pas partie de cette Team ou communauté.');
}

async function conflict(env,participantId,eventId,departureId,organizationId){
  if(!participantId)return false;
  const rows=(await env.DB.prepare('SELECT DISTINCT organization_id FROM registrations WHERE participant_id=? AND event_id=? AND departure_id=?').bind(participantId,eventId,departureId).all()).results||[];
  const target=organizationId||'';
  return rows.some(row=>(row.organization_id||'')!==target);
}

async function preflightRegistration(env,actor,input,ids,organizationId){
  let participant=null;
  if(input?.participantId&&UUID.test(input.participantId))participant=await env.DB.prepare('SELECT * FROM participants WHERE id=?').bind(input.participantId).first();
  else if(input?.participantUserId&&DISCORD_ID.test(input.participantUserId))participant=await env.DB.prepare('SELECT * FROM participants WHERE user_id=?').bind(input.participantUserId).first();
  else if(actor.user&&input?.forOther!==true)participant=await env.DB.prepare('SELECT * FROM participants WHERE user_id=?').bind(actor.user.id).first();
  if(organizationId&&participant)await ensureParticipantMember(env,organizationId,participant);
  if(participant&&await conflict(env,participant.id,ids.eventId,ids.departureId,organizationId))fail(409,'Ce pilote est déjà engagé sur ce départ avec une autre organisation.');
}

async function createRegistration(request,env,actor,ids,input,organizationId){
  await secureWrite(request,env);
  await requireMember(env,actor,organizationId);
  if(input.forOther===true&&!input.participantId&&!input.participantUserId)fail(409,'Ajoute d’abord ce pilote à la Team ou à la communauté avec son compte Discord.');
  const {event,departure}=await loadEventDeparture(env,ids);
  const data=validateRegistration(input,event);
  const participant=await registrationParticipant(env,actor,input,data);
  await ensureParticipantMember(env,organizationId,participant);
  if(await conflict(env,participant.id,event.id,departure.id,organizationId))fail(409,'Ce pilote est déjà engagé sur ce départ avec une autre organisation.');
  if(input.participantId){data.name=participant.name;data.nameKey=data.name.normalize('NFKC').toLocaleLowerCase('fr-FR');}
  const regId=id();
  const result=await env.DB.prepare(`INSERT INTO registrations(
      id,event_id,departure_id,user_id,owner_user_id,guest_hash,name,name_key,category,car,car_preferences,car_any,status,preferred_pilot,created_at,participant_id,organization_id
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      regId,event.id,departure.id,participant.user_id,actor.user.id,null,data.name,data.nameKey,data.category,data.car,
      JSON.stringify(data.cars),data.carAny?1:0,data.status,data.preferredPilot,now(),participant.id,organizationId
    ).run();
  if(!result.meta.changes)fail(409,'Impossible d’enregistrer cette inscription. Actualise avant de réessayer.');
  return json({id:regId,recoveryLink:null},201);
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
  const own=(await env.DB.prepare(registrationSelect+' WHERE r.event_id=? AND r.departure_id=? AND r.category=? AND r.status!=? AND r.organization_id=?').bind(event.id,departure.id,input.category,'unavailable',organizationId).all()).results||[];
  const selected=own.find(reg=>personal(reg,actor));
  if(!selected)fail(403,'Inscris-toi d’abord dans cette organisation sur ce départ avant de créer ton équipage.');
  const results=await env.DB.batch([
    env.DB.prepare('INSERT INTO crews(id,event_id,departure_id,name,category,car,owner_user_id,organization_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(crewId,event.id,departure.id,name,input.category,car,actor.user.id,organizationId,now()),
    env.DB.prepare('INSERT INTO crew_members(registration_id,crew_id) SELECT ?,? WHERE changes()=1').bind(selected.id,crewId),
    env.DB.prepare('DELETE FROM registrations WHERE changes()=1 AND id!=? AND event_id=? AND departure_id=? AND participant_id=? AND organization_id=?').bind(selected.id,selected.event_id,selected.departure_id,selected.participant_id,organizationId)
  ]);
  if(!results[0].meta.changes)fail(409,'Impossible de créer cet équipage. Actualise avant de réessayer.');
  return json({id:crewId,joined:true,removedRegistrations:results[2].meta.changes},201);
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
  const [registrationRows,crewRows,allowed]=await Promise.all([
    env.DB.prepare(`SELECT id,organization_id FROM registrations WHERE event_id IN (${marks})`).bind(...eventIds).all(),
    env.DB.prepare(`SELECT id,organization_id FROM crews WHERE event_id IN (${marks})`).bind(...eventIds).all(),
    accessibleOrganizations(env,actor)
  ]);
  const registrationOrg=new Map((registrationRows.results||[]).map(row=>[row.id,row.organization_id||null]));
  const crewOrg=new Map((crewRows.results||[]).map(row=>[row.id,row.organization_id||null]));
  const visible=organizationId=>!organizationId||allowed.has(organizationId);
  for(const event of data.events){
    for(const departure of event.departures||[]){
      departure.availability=(departure.availability||[]).flatMap(reg=>{
        const organizationId=registrationOrg.get(reg.id)||null;
        return visible(organizationId)?[{...reg,organizationId}]:[];
      });
      departure.crews=(departure.crews||[]).flatMap(crew=>{
        const organizationId=crewOrg.get(crew.id)||null;
        return visible(organizationId)?[{...crew,organizationId}]:[];
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
    const organizationId=orgId(input.organizationId);
    if(input.organizationId&&(!organizationId||!UUID.test(organizationId)))fail(400,'Organisation invalide.');
    await preflightRegistration(env,actor,input,registrationIds,organizationId);
    if(organizationId)return createRegistration(request,env,actor,registrationIds,input,organizationId);
  }
  const crewIds=method==='POST'?eventDeparture(path,'crews'):null;
  if(crewIds){
    const input=await request.clone().json().catch(()=>null);if(!input)fail(400,'Formulaire invalide.');
    const organizationId=orgId(input.organizationId);
    if(input.organizationId&&(!organizationId||!UUID.test(organizationId)))fail(400,'Organisation invalide.');
    if(organizationId)return createCrew(request,env,actor,crewIds,input,organizationId);
  }
  const registration=path.match(/^\/api\/registrations\/([a-f0-9-]{36})$/);
  if(registration&&['PATCH','DELETE'].includes(method)){
    const row=await env.DB.prepare('SELECT organization_id FROM registrations WHERE id=?').bind(registration[1]).first();
    if(row?.organization_id)await requireMember(env,actor,row.organization_id);
  }
  const crew=path.match(/^\/api\/crews\/([a-f0-9-]{36})/);
  if(crew&&['POST','PATCH','DELETE'].includes(method)){
    const row=await env.DB.prepare('SELECT organization_id FROM crews WHERE id=?').bind(crew[1]).first();
    if(row?.organization_id)await requireMember(env,actor,row.organization_id);
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
    if(message.includes('participant_other_organization'))return json({error:'Ce pilote est déjà engagé sur ce départ avec une autre organisation.'},409);
    if(message.includes('organization_mismatch'))return json({error:'Le pilote et l’équipage doivent appartenir à la même Team ou communauté.'},409);
    if(message.includes('organization_fixed'))return json({error:'L’organisation d’une inscription ou d’un équipage ne peut pas être changée après sa création.'},409);
    if(message.includes('UNIQUE constraint failed: organizations.'))return json({error:'Une organisation de ce type utilise déjà ce nom.'},409);
    console.error('Organization API failure',error instanceof Error?error.message:'unknown');
    return json({error:'Impossible de gérer cette Team ou communauté pour le moment.'},503);
  }
}
