import {body,fail,hash,id,json,now,token,DAY,rateLimit,siteOrigin} from './core.mjs';
import {communityAccess} from './access.mjs';
import {currentCommunity} from './community.mjs';
import {analysePreparation,nextSession} from '../shared/preparation.mjs';
import {CIRCUITS,gameForEvent} from '../shared/catalog.mjs';

const enabled=community=>community.modules?.preparation===true;
async function crewAccess(env,actor,community,crewId){
  if(!actor.user)fail(401,'Connecte-toi avec Discord.');
  if(!enabled(community))fail(404,'Le module préparation est désactivé.');
  const crew=await env.DB.prepare('SELECT * FROM crews WHERE id=? AND community_id=?').bind(crewId,community.id).first();
  if(!crew)fail(404,'Équipage introuvable.');
  const members=(await env.DB.prepare(`SELECT DISTINCT p.user_id,u.name FROM crew_members m JOIN registrations r ON r.id=m.registration_id
    JOIN participants p ON p.id=r.participant_id LEFT JOIN users u ON u.id=p.user_id WHERE m.crew_id=? AND p.user_id IS NOT NULL`).bind(crew.id).all()).results||[];
  const manage=actor.permissions?.has('manage_registrations')||crew.owner_user_id===actor.user.id;
  if(!manage&&!members.some(m=>m.user_id===actor.user.id))fail(403,'La préparation est réservée à ton équipage.');
  const event=await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(crew.event_id).first();
  const saved=await env.DB.prepare('SELECT conditions,setup_name,setup_car,updated_at FROM preparation_settings WHERE crew_id=?').bind(crew.id).first();
  return {crew,event,members,manage,conditions:saved?JSON.parse(saved.conditions):{wet:null,night:null,stintMinutes:40},setup:saved?.setup_name&&saved.setup_car===crew.car?{name:saved.setup_name,updatedAt:saved.updated_at}:null};
}
async function sessionsFor(env,community,user,game,circuit,car){
  // A rolling 60-day window; old preparation must not be mistaken for current practice.
  const rows=(await env.DB.prepare(`SELECT client_id,started_at,laps FROM preparation_sessions
    WHERE community_id=? AND user_id=? AND game=? AND circuit=? AND car=? AND started_at>=?
    ORDER BY started_at DESC LIMIT 100`).bind(community.id,user,game,circuit,car,(Date.now()-60*DAY*1000)).all()).results||[];
  return rows.map(row=>({clientId:row.client_id,startedAt:row.started_at,laps:JSON.parse(row.laps)}));
}
function validateConditions(input){
  for(const key of ['wet','night'])if(input[key]!==null&&typeof input[key]!=='boolean')fail(400,'Conditions invalides.');
  if(!Number.isInteger(input.stintMinutes)||input.stintMinutes<20||input.stintMinutes>180)fail(400,'Choisis un relais de 20 à 180 minutes.');
  return {wet:input.wet,night:input.night,stintMinutes:input.stintMinutes};
}
export function validateCapture(input){
  if(typeof input.clientId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(input.clientId))fail(400,'Identifiant de séance invalide.');
  if(!['lmu','iracing'].includes(input.game))fail(400,'Simulateur invalide.');
  for(const key of ['circuit','car'])if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>120)fail(400,'Voiture ou circuit invalide.');
  if(!Number.isInteger(input.startedAt)||input.startedAt>Date.now()+300000||input.startedAt<Date.now()-60*DAY*1000)fail(400,'Date de séance invalide.');
  if(!Array.isArray(input.laps)||!input.laps.length||input.laps.length>100)fail(400,'Envoie de 1 à 100 tours par lot.');
  const seen=new Set();
  const laps=input.laps.map(lap=>{
    if(!lap||!Number.isInteger(lap.number)||lap.number<1||lap.number>10000||seen.has(lap.number))fail(400,'Numéro de tour invalide.');seen.add(lap.number);
    if(typeof lap.seconds!=='number'||!Number.isFinite(lap.seconds)||lap.seconds<10||lap.seconds>3600)fail(400,'Chrono invalide.');
    const result={number:lap.number,seconds:lap.seconds};
    for(const key of ['valid','pit','wet','night','continuous']){if(lap[key]!=null&&typeof lap[key]!=='boolean')fail(400,'État du tour invalide.');result[key]=lap[key]??null;}
    for(const key of ['fuelUsed','energyUsed']){const v=lap[key];if(v!=null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100))fail(400,'Consommation invalide.');result[key]=v??null;}
    return result;
  });
  return {clientId:input.clientId,game:input.game,circuit:input.circuit.trim(),car:input.car.trim(),startedAt:input.startedAt,laps: laps.sort((a,b)=>a.number-b.number)};
}

// A native collector has no browser Origin. Only these two endpoints accept a scoped bearer token.
// It cannot act on registrations, read team telemetry, or change settings.
export async function collectorApi(path,method,request,env){
  if(!['/api/preparation/collector/laps','/api/preparation/collector/target'].includes(path))return null;
  if((path.endsWith('/laps')&&method!=='POST')||(path.endsWith('/target')&&method!=='GET'))fail(405,'Méthode refusée.');
  const raw=request.headers.get('Authorization')||'';
  if(!/^Bearer [a-f0-9]{64}$/.test(raw))fail(401,'Liaison SimHub requise.');
  const community=await currentCommunity(env,request);
  if(!enabled(community))fail(404,'Le module préparation est désactivé.');
  const device=await env.DB.prepare('SELECT * FROM preparation_devices WHERE token_hash=? AND community_id=? AND expires_at>?').bind(await hash(raw.slice(7)),community.id,now()).first();
  if(!device)fail(401,'La liaison SimHub a expiré ou a été retirée.');
  const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(device.user_id).first();
  const access=await communityAccess(env,{user},community);
  if(access.status!=='member')fail(403,'Accès à la communauté requis.');
  const actor={user,permissions:access.permissions};
  await rateLimit(request,env,'preparation-collector',400);
  const crewId=method==='GET'?new URL(request.url).searchParams.get('crew'):null;
  if(method==='GET'){
    const {crew,event}=await crewAccess(env,actor,community,crewId);
    if(!crew.car)fail(409,'L’équipage doit choisir sa voiture.');
    return json({game:gameForEvent(event),circuit:event.circuit,circuitName:CIRCUITS.find(c=>c.id===event.circuit)?.name||event.circuit,car:crew.car});
  }
  const input=await body(request),data=validateCapture(input);
  const {crew,event}=await crewAccess(env,actor,community,input.crewId);
  if(!crew.car||data.game!==gameForEvent(event)||data.circuit!==event.circuit||data.car!==crew.car)fail(409,'La séance ne correspond pas à la voiture et au circuit de l’équipage.');
  const existing=await env.DB.prepare('SELECT * FROM preparation_sessions WHERE community_id=? AND user_id=? AND client_id=?').bind(community.id,user.id,data.clientId).first();
  if(existing&&(existing.game!==data.game||existing.circuit!==data.circuit||existing.car!==data.car||existing.started_at!==data.startedAt))fail(409,'Identifiant de séance déjà utilisé.');
  const byNumber=new Map((existing?JSON.parse(existing.laps):[]).map(lap=>[lap.number,lap]));
  for(const lap of data.laps)byNumber.set(lap.number,lap);
  if(byNumber.size>1000)fail(400,'Limite de 1 000 tours par séance.');
  const saved=JSON.stringify([...byNumber.values()].sort((a,b)=>a.number-b.number));
  const observedVersion=existing?.updated_at||0;
  // Compare-and-swap protects concurrent retries from silently losing a previously accepted batch.
  const result=existing
    ?await env.DB.prepare('UPDATE preparation_sessions SET laps=?,updated_at=? WHERE id=? AND updated_at=?').bind(saved,Math.max(Date.now(),observedVersion+1),existing.id,observedVersion).run()
    :await env.DB.prepare(`INSERT OR IGNORE INTO preparation_sessions(id,community_id,user_id,client_id,game,circuit,car,started_at,updated_at,laps) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(id(),community.id,user.id,data.clientId,data.game,data.circuit,data.car,data.startedAt,Date.now(),saved).run();
  if(!result.meta.changes)fail(409,'Réessaie ce lot de tours.');
  await env.DB.prepare('UPDATE preparation_devices SET last_seen=? WHERE community_id=? AND user_id=?').bind(now(),community.id,user.id).run();
  return json({ok:true,accepted:data.laps.length});
}

export async function preparationApi(path,method,request,env,actor,community){
  const match=path.match(/^\/api\/crews\/([^/]+)\/preparation(?:\/(conditions|profile|device|setup))?$/);
  if(!match)return null;
  const context=await crewAccess(env,actor,community,match[1]);
  const {crew,event,members,manage,conditions,setup}=context,game=gameForEvent(event),action=match[2]||'';
  if(!action&&method==='GET'){
    const profile=await env.DB.prepare('SELECT level FROM preparation_profiles WHERE user_id=? AND community_id=? AND circuit=?').bind(actor.user.id,community.id,event.circuit).first();
    const level=profile?.level||'discover',sessions=await sessionsFor(env,community,actor.user.id,game,event.circuit,crew.car),analysis=analysePreparation(sessions,conditions,level);
    const roster=[];
    for(const member of members){const own=member.user_id===actor.user.id;const a=own?analysis:analysePreparation(await sessionsFor(env,community,member.user_id,game,event.circuit,crew.car),conditions,'familiar');
      roster.push({name:member.name,mine:own,minutes:a.minutes,longestMinutes:a.longestMinutes,coverage:a.coverage.map(({key,status})=>({key,status}))});}
    const device=await env.DB.prepare('SELECT expires_at,last_seen FROM preparation_devices WHERE community_id=? AND user_id=?').bind(community.id,actor.user.id).first();
    return json({crew:{id:crew.id,name:crew.name,car:crew.car},event:{id:event.id,name:event.name,circuit:event.circuit,circuitName:CIRCUITS.find(c=>c.id===event.circuit)?.name||event.circuit,game},manage,conditions,setup,level,analysis,roster,
      next:nextSession(analysis,level),sessions:sessions.slice(0,12).map(s=>({startedAt:s.startedAt,...analysePreparation([s],conditions,level)})),
      device:device&&device.expires_at>now()?{linked:true,lastSeen:device.last_seen}: {linked:false}});
  }
  if(action==='conditions'&&method==='PATCH'){
    if(!manage)fail(403,'Le responsable choisit les conditions de préparation.');
    const data=validateConditions(await body(request));
    await env.DB.prepare(`INSERT INTO preparation_settings(crew_id,conditions,updated_at) VALUES(?,?,?) ON CONFLICT(crew_id) DO UPDATE SET conditions=excluded.conditions,updated_at=excluded.updated_at`).bind(crew.id,JSON.stringify(data),now()).run();
    return json({ok:true});
  }
  if(action==='profile'&&method==='PATCH'){
    const {level}=await body(request);if(!['discover','familiar'].includes(level))fail(400,'Parcours invalide.');
    await env.DB.prepare(`INSERT INTO preparation_profiles(user_id,community_id,circuit,level) VALUES(?,?,?,?) ON CONFLICT(user_id,community_id,circuit) DO UPDATE SET level=excluded.level`).bind(actor.user.id,community.id,event.circuit,level).run();
    return json({ok:true});
  }
  if(action==='device'&&method==='POST'){
    const raw=token();
    await env.DB.prepare(`INSERT INTO preparation_devices(community_id,user_id,token_hash,expires_at) VALUES(?,?,?,?) ON CONFLICT(community_id,user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,last_seen=NULL`).bind(community.id,actor.user.id,await hash(raw),now()+180*DAY).run();
    // Returned once, downloaded locally; never put a credential in a URL or diagnostic.
    return json({endpoint:siteOrigin(request,env),token:raw,crewId:crew.id});
  }
  if(action==='device'&&method==='DELETE'){
    await env.DB.prepare('DELETE FROM preparation_devices WHERE community_id=? AND user_id=?').bind(community.id,actor.user.id).run();return json({ok:true});
  }
  if(action==='setup'&&method==='GET'){
    const row=await env.DB.prepare('SELECT setup_bytes,setup_name,setup_car FROM preparation_settings WHERE crew_id=?').bind(crew.id).first();
    if(!row?.setup_bytes||row.setup_car!==crew.car)fail(404,'Aucun setup pour cette voiture.');
    return new Response(new Uint8Array(row.setup_bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${row.setup_name}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(action==='setup'&&method==='PUT'){
    if(!manage)fail(403,'Le responsable choisit le setup commun.');
    if(!crew.car)fail(409,'Choisis d’abord la voiture.');
    const name=request.headers.get('X-Setup-Name')||'';
    if(!/^[a-zA-Z0-9_. -]{1,100}\.(svm|sto)$/i.test(name))fail(400,'Envoie un fichier .svm ou .sto avec un nom simple.');
    const reader=request.body?.getReader();if(!reader)fail(400,'Fichier manquant.');
    const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>128000){await reader.cancel();fail(413,'Setup limité à 128 Ko.');}chunks.push(value);}
    if(!size)fail(400,'Fichier vide.');
    const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    await env.DB.prepare(`INSERT INTO preparation_settings(crew_id,conditions,setup_name,setup_bytes,setup_car,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(crew_id) DO UPDATE SET setup_name=excluded.setup_name,setup_bytes=excluded.setup_bytes,setup_car=excluded.setup_car,updated_at=excluded.updated_at`).bind(crew.id,JSON.stringify(conditions),name,bytes,crew.car,now()).run();
    return json({ok:true});
  }
  fail(405,'Méthode refusée.');
}

export async function purgePreparation(env){
  await env.DB.batch([
    env.DB.prepare('DELETE FROM preparation_sessions WHERE id IN (SELECT id FROM preparation_sessions WHERE started_at<? LIMIT 500)').bind(Date.now()-60*DAY*1000),
    env.DB.prepare('DELETE FROM preparation_devices WHERE expires_at<?').bind(now())
  ]);
}
