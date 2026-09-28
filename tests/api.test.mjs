import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
import workerWithMigrations from '../server/worker-with-migrations.mjs';
import {SEASON} from './fixtures/iracing-season.mjs';
const ROOT='https://site.example';
const ADMIN='111111111111111111', PILOT='222222222222222222', OTHER='333333333333333333';
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');this.db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));this.db.exec(readFileSync(new URL('../migrations/0002_event_duration.sql',import.meta.url),'utf8'));this.db.exec(readFileSync(new URL('../migrations/0003_event_type.sql',import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){if(params.length>100)throw new Error('D1_ERROR: too many SQL variables');this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {success:true,meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}
function harness(withParticipants=true){
 const DB=new D1();
 DB.db.exec(readFileSync(new URL('../migrations/0004_crews.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0005_registration_preference.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0006_registration_car.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0007_registration_car_preferences.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0008_event_circuit.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0009_registration_owner.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0011_multi_category_registrations.sql',import.meta.url),'utf8'));
 if(withParticipants)DB.db.exec(readFileSync(new URL('../migrations/0012_participants.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0026_event_schedule_pending.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0027_solo_races.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0028_solo_round_choices.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0029_event_duration_minutes.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0030_iracing_import.sql',import.meta.url),'utf8'));
 DB.db.exec(readFileSync(new URL('../migrations/0031_solo_driver.sql',import.meta.url),'utf8'));
 const env={DB,APP_ORIGIN:ROOT,SOLO_RACES:'on',DISCORD_CLIENT_ID:'app-id',DISCORD_CLIENT_SECRET:'test-only-secret',ADMIN_DISCORD_IDS:ADMIN,ASSETS:{fetch:async()=>new Response('static')}};
 const jars=new Map();
 async function req(path,method='GET',data,actor='guest',options={}){
  const jar=jars.get(actor)||{};
  const headers={'CF-Connecting-IP':actor,'Cookie':Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; '),...options.headers};
  if(method!=='GET'){headers['Origin']=options.origin ?? ROOT;headers['Content-Type']='application/json';}
  const response=await worker.fetch(new Request(ROOT+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(data||{})}),env);
  for(const raw of response.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');const name=pair.slice(0,i),value=pair.slice(i+1);if(value)jar[name]=value;else delete jar[name];}
  jars.set(actor,jar);
  const result=await response.clone().json().catch(()=>null);
  return {response,status:response.status,data:result};
 }
 async function login(discordId,actor){
  const start=await req('/api/auth/discord','GET',null,actor);assert.equal(start.status,302);
  const url=new URL(start.response.headers.get('Location'));assert.equal(url.searchParams.get('scope'),'identify');
  const realFetch=globalThis.fetch;
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/token')?{access_token:'mock-discord-token'}:{id:discordId,username:'Pilote '+discordId}),{headers:{'Content-Type':'application/json'}});
  try{const callback=await req('/api/auth/discord/callback?code=test-code&state='+url.searchParams.get('state'),'GET',null,actor);assert.equal(callback.status,302);assert.equal(callback.response.headers.get('Location'),ROOT+'/');return url.searchParams.get('state');}finally{globalThis.fetch=realFetch;}
 }
 return {DB,env,req,login,jars};
}
const eventInput={name:'Daytona 8H',categories:['Hypercar','LMP2 ELMS','GTE'],departures:[{date:'2090-10-15',time:'15:00'},{date:'2090-10-14',time:'14:00'}]};
test('stable managed profile survives rename and cross-organizer assignment; outsiders cannot claim it',async()=>{
 const {req,login,DB}=harness();await login(ADMIN,'admin');await login(OTHER,'org');await login(PILOT,'pilot');
 await req('/api/members/'+OTHER,'PATCH',{role:'organizer'},'admin');
 await req('/api/events','POST',{...eventInput,categories:['Hypercar','GT3']},'admin');
 const event=(await req('/api/events')).data.events[0],dep=event.departures[0],base=`/api/events/${event.id}/departures/${dep.id}`;
 const first=await req(base+'/registrations','POST',{name:'Teammate',category:'Hypercar',status:'whole',forOther:true},'admin');assert.equal(first.status,201);
 let record=(await req('/api/events','GET',null,'admin')).data.events[0].departures[0].availability[0];
 assert.equal(record.mine,false);assert.equal(record.managed,true);
 const pid=record.participantId;
 for(const actor of ['guest','pilot'])assert.equal((await req(base+'/registrations','POST',{name:'Teammate',category:'GT3',status:'whole',participantId:pid},actor)).status,403);
 assert.equal((await req('/api/registrations/'+first.data.id,'PATCH',{name:'New name',category:'Hypercar',status:'whole',version:1},'admin')).status,200);
 const second=await req(base+'/registrations','POST',{name:'New name',category:'GT3',status:'whole',participantId:pid,forOther:true},'org');assert.equal(second.status,201);
 const crew=await req(base+'/crews','POST',{name:'Team',category:'GT3'},'org');assert.equal(crew.status,201);
 const assigned=await req('/api/crews/'+crew.data.id+'/members','POST',{registrationId:second.data.id,version:1},'org');assert.equal(assigned.status,200);assert.equal(assigned.data.removedRegistrations,1);
 assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM registrations WHERE participant_id=?').get(pid).n,1);
 assert.equal((await req(base+'/registrations','POST',{name:'New name',category:'Hypercar',status:'whole',participantId:pid},'admin')).status,409);
 assert.equal((await req('/api/registrations/'+second.data.id,'PATCH',{name:'New name',category:'GT3',status:'unavailable',version:1},'org')).status,409);
 assert.equal((await req('/api/registrations/'+second.data.id,'PATCH',{name:'New name',category:'GT3',status:'h1,h2',version:1},'org')).status,200);
 await req('/api/auth/logout','POST',{},'org');await login(OTHER,'org');
 record=(await req('/api/events','GET',null,'org')).data.events[0].departures[0].availability[0];assert.equal(record.managed,true);assert.equal(record.mine,false);assert.equal(record.canEdit,true);
});
test('0012 preserves populated registrations, ownership and crew membership',()=>{
 const {DB}=harness(false),db=DB.db;
 db.prepare("INSERT INTO users(id,name,role,created_at) VALUES(?,?,'organizer',1)").run(ADMIN,'Admin');
 db.prepare("INSERT INTO events(id,name,categories,departures,created_by,created_at) VALUES('event','Race',?,?,?,1)").run(JSON.stringify(['Hypercar','GT3']),JSON.stringify([{id:'dep',date:'2090-01-01',time:'12:00'}]),ADMIN);
 const insert=db.prepare("INSERT INTO registrations(id,event_id,departure_id,owner_user_id,guest_hash,name,name_key,category,status,created_at) VALUES(?,'event','dep',?,?,?,'teammate',?,'whole',1)");
 insert.run('r1',ADMIN,'token1','Teammate','Hypercar');insert.run('r2',ADMIN,'token2','Teammate','GT3');
 db.exec("INSERT INTO crews(id,event_id,departure_id,name,category,created_at) VALUES('crew','event','dep','Team','GT3',1); INSERT INTO crew_members VALUES('r2','crew');");
 const before=db.prepare('SELECT * FROM registrations ORDER BY id').all();
 db.exec('BEGIN');db.exec(readFileSync(new URL('../migrations/0012_participants.sql',import.meta.url),'utf8'));db.exec('COMMIT');
 const after=db.prepare('SELECT * FROM registrations ORDER BY id').all();
 assert.equal(after[0].participant_id,after[1].participant_id);assert(after[0].participant_id);
 for(let i=0;i<before.length;i++){const {participant_id,...rest}=after[i];assert.deepEqual(rest,{...before[i]});}
 assert.equal(db.prepare('SELECT COUNT(*) n FROM crew_members').get().n,1);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('one pilot may register in multiple categories until an organizer assigns one to a crew',async()=>{
 const {req,login}=harness();
 await login(ADMIN,'admin');await login(PILOT,'pilot');
 const created=await req('/api/events','POST',{...eventInput,name:'Multi catégories',categories:['Hypercar','GT3']},'admin');
 const event=(await req('/api/events')).data.events[0],departure=event.departures[0];
 const path=`/api/events/${created.data.id}/departures/${departure.id}/registrations`;
 const hyper=await req(path,'POST',{name:'Pilote multi',category:'Hypercar',status:'whole'},'pilot');assert.equal(hyper.status,201);
 const gt3=await req(path,'POST',{name:'Pilote multi',category:'GT3',status:'whole'},'pilot');assert.equal(gt3.status,201);
 assert.notEqual(hyper.data.id,gt3.data.id);
 const before=(await req('/api/events','GET',null,'pilot')).data.events.find(e=>e.id===created.data.id).departures[0].availability;
 assert.deepEqual(before.map(r=>r.category).sort(),['GT3','Hypercar']);
 const crew=await req(`/api/events/${created.data.id}/departures/${departure.id}/crews`,'POST',{name:'GT3 équipe',category:'GT3',car:'Ferrari 296 LMGT3'},'admin');assert.equal(crew.status,201);
 const member=await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:gt3.data.id,version:1},'admin');assert.equal(member.status,200);
 const after=(await req('/api/events','GET',null,'pilot')).data.events.find(e=>e.id===created.data.id).departures[0];
 assert.deepEqual(after.availability.map(r=>r.category),['GT3']);
 assert.deepEqual(after.crews[0].registrationIds,[gt3.data.id]);
});
test('managed multi-category assignment removes only the matching pilot on the same departure',async()=>{
 const {req,login,DB}=harness();
 await login(ADMIN,'admin');await login(OTHER,'organizer');
 await req('/api/members/'+OTHER,'PATCH',{role:'organizer'},'admin');
 for(const actor of ['admin','organizer']) {
  await req('/api/events','POST',{...eventInput,name:actor,categories:['Hypercar','GT3']},actor);
  const event=(await req('/api/events')).data.events.find(e=>e.name===actor),dep=event.departures[0];
  const path=`/api/events/${event.id}/departures/${dep.id}`;
  const add=async(name,category,base=path)=>{
   const participant=DB.db.prepare('SELECT id FROM participants WHERE name=?').get(name);
   const result=await req(base+'/registrations','POST',{name,category,status:'whole',forOther:true,participantId:participant?.id},actor);
   assert.equal(result.status,201);return result.data.id;
  };
  const hyper=await add('Nathan','Hypercar'),gt=await add('Nathan','GT3');
  const teammate=await add('McFly','Hypercar');
  const otherDeparture=await add('Nathan','Hypercar',`/api/events/${event.id}/departures/${event.departures[1].id}`);
  const tokens=DB.db.prepare('SELECT guest_hash FROM registrations WHERE id IN (?,?)').all(hyper,gt);
  assert.notEqual(tokens[0].guest_hash,tokens[1].guest_hash);
  const crew=await req(path+'/crews','POST',{name:'Equipe',category:'GT3',car:''},actor);
  assert.equal(crew.status,201);
  assert.equal((await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:gt,version:0},actor)).status,409);
  assert(DB.db.prepare('SELECT id FROM registrations WHERE id=?').get(hyper));
  assert.equal((await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:gt,version:1},actor)).status,200);
  assert.equal(DB.db.prepare('SELECT id FROM registrations WHERE id=?').get(hyper),undefined);
  for(const kept of [gt,teammate,otherDeparture])assert(DB.db.prepare('SELECT id FROM registrations WHERE id=?').get(kept));
  assert.equal(DB.db.prepare('SELECT crew_id FROM crew_members WHERE registration_id=?').get(gt).crew_id,crew.data.id);
 }
});
test('crews: manager-only writes, category/departure integrity, concurrency and preserved registrations',async()=>{
 const {req,login,DB}=harness();
 await login(ADMIN,'admin');await login(PILOT,'pilot');await login(OTHER,'organizer');
 await req('/api/members/'+OTHER,'PATCH',{role:'organizer'},'admin');
 assert.equal((await req('/api/events','POST',eventInput,'admin')).status,201);
 const event=(await req('/api/events')).data.events[0],dep=event.departures[0],second=event.departures[1];
 const base=`/api/events/${event.id}/departures/${dep.id}`;
 const payload={name:'Équipe 1',category:'Hypercar',car:'Prototype test'};
 assert.equal((await req(base+'/crews','POST',payload)).status,401);
 assert.equal((await req(base+'/crews','POST',payload,'pilot')).status,403);
 const created=await req(base+'/crews','POST',payload,'organizer');assert.equal(created.status,201);
 const id=created.data.id,crewPath='/api/crews/'+id;
 const invalidCar=await req(base+'/registrations','POST',{name:'Pilote invalide',category:'Hypercar',car:'Voiture inconnue',status:'whole'},'guest-invalid');assert.equal(invalidCar.status,400);
 const reg=await req(base+'/registrations','POST',{name:'Pilote A',category:'Hypercar',cars:['Ferrari 499P','Porsche 963'],status:'h1,h3',preferredPilot:'Pilote B'},'pilot');assert.equal(reg.status,201);
 const bad=await req(base+'/registrations','POST',{name:'Pilote B',category:'GTE',carAny:true,status:'whole'},'guest2');assert.equal(bad.status,201);
 const elsewhere=await req(`/api/events/${event.id}/departures/${second.id}/registrations`,'POST',{name:'Pilote C',category:'Hypercar',status:'whole'},'guest3');
 const add=(registrationId,version=1,actor='organizer')=>req(crewPath+'/members','POST',{registrationId,version},actor);
 assert.equal((await add(reg.data.id,1,'pilot')).status,403);
 assert.equal((await add(bad.data.id)).status,409);
 assert.equal((await add(elsewhere.data.id)).status,409);
 assert.equal((await add(reg.data.id)).status,200);
 let listing=(await req('/api/events')).data.events[0].departures[0].crews[0];
 assert.equal(listing.car,'Prototype test');assert.deepEqual(listing.registrationIds,[reg.data.id]);assert.equal(listing.version,2);
 assert.equal((await req('/api/events')).data.events[0].departures[0].availability.find(r=>r.id===reg.data.id).preferredPilot,'Pilote B');
 assert.equal((await req('/api/events')).data.events[0].departures[0].availability.find(r=>r.id===reg.data.id).car,'Ferrari 499P');
 assert.deepEqual((await req('/api/events')).data.events[0].departures[0].availability.find(r=>r.id===reg.data.id).cars,['Ferrari 499P','Porsche 963']);
 assert.equal((await req('/api/events')).data.events[0].departures[0].availability.find(r=>r.id===bad.data.id).carAny,true);
 assert.equal((await req(crewPath,'PATCH',{...payload,version:1},'organizer')).status,409);
 const duplicate=await req(base+'/crews','POST',{...payload,name:'Équipe 2'},'admin');assert.equal(duplicate.status,201);
 assert.equal((await req('/api/crews/'+duplicate.data.id+'/members','POST',{registrationId:reg.data.id,version:1},'admin')).status,409);
 assert.equal((await req(crewPath,'PATCH',{...payload,category:'GTE',version:2},'organizer')).status,409);
 assert.equal((await req('/api/registrations/'+reg.data.id,'PATCH',{name:'Pilote A',category:'GTE',status:'whole',version:1},'pilot')).status,409);
 assert.equal((await req('/api/events/'+event.id,'PATCH',{...event,categories:['GTE']},'admin')).status,409);
 assert.equal((await req(crewPath,'DELETE',{version:2},'pilot')).status,403);
 assert.equal((await req(crewPath+'/members/'+reg.data.id,'DELETE',{version:2},'organizer')).status,200);
 assert.equal(DB.db.prepare('SELECT count(*) n FROM registrations').get().n,3);
 assert.equal((await req('/api/registrations/'+reg.data.id,'PATCH',{name:'Pilote A',category:'GTE',status:'whole',version:1},'pilot')).status,200);
 assert.equal((await req(crewPath,'PATCH',{...payload,category:'GTE',version:3},'organizer')).status,200);
 assert.equal((await add(reg.data.id,4)).status,200);
 assert.equal((await req('/api/registrations/'+reg.data.id,'DELETE',{version:2},'pilot')).status,200);
 assert.equal(DB.db.prepare('SELECT count(*) n FROM crew_members').get().n,0);
 assert.equal((await req(crewPath,'DELETE',{version:5},'organizer')).status,200);
 assert.equal(DB.db.prepare('SELECT count(*) n FROM registrations').get().n,2);
 // An empty crew also protects its departure from deletion.
 DB.db.prepare('DELETE FROM registrations').run();
 assert.equal((await req('/api/events/'+event.id,'PATCH',{...event,departures:[second]},'admin')).status,409);
 assert.equal((await req('/api/events/'+event.id,'DELETE',{version:1},'admin')).status,200);
 assert.equal(DB.db.prepare('SELECT count(*) n FROM crews').get().n,0);
});
test('shared events, actual Discord callback, role grants/revocation, guest recovery and ownership',async()=>{
 const h=harness(),{req,login,DB}=h;
 assert.equal((await req('/api/events','POST',eventInput)).status,401);
 await login(ADMIN,'admin');await login(PILOT,'pilot');await login(OTHER,'other');
 assert.equal((await req('/api/session','GET',null,'admin')).data.user.role,'admin');
 assert.equal((await req('/api/events','POST',eventInput,'pilot')).status,403);
 assert.equal((await req('/api/members','GET',null,'pilot')).status,403);
 assert.equal((await req('/api/members/'+PILOT,'PATCH',{role:'organizer'},'admin')).status,200);
 assert.equal((await req('/api/session','GET',null,'pilot')).data.user.role,'organizer');
 const created=await req('/api/events','POST',eventInput,'pilot');assert.equal(created.status,201);
 let event=(await req('/api/events')).data.events[0];assert.equal(event.name,'Daytona 8H');assert.equal(event.departures[0].date,'2090-10-14');
 const eventId=event.id,depId=event.departures[0].id;
 assert.equal((await req('/api/events/'+eventId,'DELETE',{version:1},'pilot')).status,403);
 const regPath=`/api/events/${eventId}/departures/${depId}/registrations`;
 const reg=await req(regPath,'POST',{name:'Nathan',category:'GTE',status:'whole'});assert.equal(reg.status,201);assert(reg.data.recoveryLink.startsWith(ROOT+'/#access='));
 const regId=reg.data.id;
 await login(PILOT,'guest');
 delete h.jars.get('guest')['__Host-em_guest'];
 event=(await req('/api/events','GET',null,'guest')).data.events[0];
 assert.equal(event.departures[0].availability.find(r=>r.id===regId).mine,true);
 event=(await req('/api/events')).data.events[0];assert.equal(event.departures[0].availability[0].mine,true);
 const outsider=(await req('/api/events','GET',null,'outsider')).data.events[0].departures[0].availability[0];assert.equal(outsider.mine,false);assert.equal(outsider.canEdit,false);assert(!JSON.stringify(outsider).includes('guest_hash'));
 assert.equal((await req('/api/registrations/'+regId,'PATCH',{name:'Nathan',status:'unavailable',version:1},'outsider')).status,403);
 assert.equal((await req(regPath,'POST',{name:'Nathan',category:'GTE',status:'whole'},'outsider')).status,409);
 assert.equal((await req('/api/guest/recover','POST',{token:new URL(reg.data.recoveryLink).hash.split('=')[1]},'new-device')).status,200);
 assert.equal((await req('/api/registrations/'+regId,'PATCH',{name:'Nathan',category:'Hypercar',status:'beginning,end',version:1},'new-device')).status,200);
 assert.equal((await req('/api/registrations/'+regId,'PATCH',{name:'Nathan',status:'whole',category:'GTE',version:1})).status,409);
 // Removing a category or a departure that still has a registration must be rejected atomically.
 assert.equal((await req('/api/events/'+eventId,'PATCH',{...event,categories:['GTE']},'pilot')).status,409);
 assert.equal((await req('/api/events/'+eventId,'PATCH',{...event,departures:[event.departures[1]]},'pilot')).status,409);
 const changed=await req('/api/events/'+eventId,'PATCH',{...event,name:'Daytona 8H — Nuit'},'pilot');assert.equal(changed.status,200);
 assert.equal((await req('/api/events/'+eventId,'PATCH',{...event,name:'stale'},'pilot')).status,409);
 // A connected account owns its registration independently of the display name.
 const own=await req(regPath,'POST',{name:'Etienne',category:'LMP2 ELMS',status:'middle'},'other');assert.equal(own.status,201);
 assert.equal((await req('/api/registrations/'+own.data.id,'DELETE',{version:1},'other')).status,200);
 assert.equal((await req('/api/members/'+PILOT,'PATCH',{role:'pilot'},'admin')).status,200);
 assert.equal((await req('/api/events','POST',eventInput,'pilot')).status,403);
 assert.equal((await req('/api/members/'+ADMIN,'PATCH',{role:'pilot'},'admin')).status,403);
 assert.equal((await req('/api/events','POST',eventInput,'admin',{origin:'https://evil.example'})).status,403);
 assert.equal((await req('/api/auth/logout','POST',{},'admin')).status,200);
 assert.equal((await req('/api/events','POST',eventInput,'admin')).status,401);
 await login(ADMIN,'admin');
 event=(await req('/api/events')).data.events[0];
 assert.equal((await req('/api/events/'+event.id,'DELETE',{version:event.version},'admin')).status,200);
 assert.equal(DB.db.prepare('SELECT count(*) n FROM registrations').get().n,0);
 assert.equal((await req('/api/events')).data.events.length,0);
});
test('pilot, organizer and admin keep ownership after Discord logout and login',async()=>{
 const h=harness(),{req,login}=h;
 await login(ADMIN,'admin');await login(PILOT,'pilot');await login(OTHER,'organizer');
 assert.equal((await req('/api/members/'+OTHER,'PATCH',{role:'organizer'},'admin')).status,200);
 const created=await req('/api/events','POST',eventInput,'admin');assert.equal(created.status,201);
 const event=(await req('/api/events')).data.events[0],regPath=`/api/events/${event.id}/departures/${event.departures[0].id}/registrations`;
 const actors=[['pilot','Pilote connecté',PILOT],['organizer','Organisateur connecté',OTHER],['admin','Administrateur connecté',ADMIN]];
 for(const [actor,name,discordId] of actors){
   const registration=await req(regPath,'POST',{name,category:'GTE',status:'whole'},actor);assert.equal(registration.status,201);
   assert.equal((await req('/api/auth/logout','POST',{},actor)).status,200);
   await login(discordId,actor);
   const refreshed=(await req('/api/events','GET',null,actor)).data.events[0].departures[0].availability.find(r=>r.id===registration.data.id);
   assert.equal(refreshed.mine,true,`${actor} registration should remain visible in My registrations`);
   assert.equal(refreshed.canEdit,true,`${actor} registration should remain editable`);
   assert.equal((await req('/api/registrations/'+registration.data.id,'DELETE',{version:1},actor)).status,200);
 }
});
test('OAuth state is bound to browser, single-use, and profile cannot grant admin',async()=>{
 const h=harness();
 const state=await h.login(PILOT,'pilot');
 assert.equal((await h.req('/api/session','GET',null,'pilot')).data.user.role,'pilot');
 const invalid=await h.req('/api/auth/discord/callback?code=test&state='+state,'GET',null,'attacker');assert.equal(invalid.response.headers.get('Location'),ROOT+'/?auth=error');
 h.jars.get('pilot')['__Host-em_oauth']=state;
 const replay=await h.req('/api/auth/discord/callback?code=test&state='+state,'GET',null,'pilot');assert.equal(replay.response.headers.get('Location'),ROOT+'/?auth=error');
 const cookie=h.jars.get('pilot')['__Host-em_session'];assert.equal(cookie.length,64);
 assert(!JSON.stringify(h.DB.db.prepare('SELECT * FROM sessions').all()).includes(cookie));
 h.DB.db.exec('UPDATE sessions SET expires_at=1');assert.equal((await h.req('/api/session','GET',null,'pilot')).data.user,null);
});
test('validation, closed departures, guest link rejection and free-tier rate limiting',async()=>{
 const h=harness();await h.login(ADMIN,'admin');
 for(const data of [{...eventInput,name:' '},{...eventInput,categories:['LMP2']},{...eventInput,departures:[{date:'2090-02-30',time:'14:00'}]},{...eventInput,departures:[eventInput.departures[0],eventInput.departures[0]]}])assert.equal((await h.req('/api/events','POST',data,'admin')).status,400);
 assert.equal((await h.req('/api/guest/recover','POST',{token:'a'.repeat(64)})).status,404);
 const old=await h.req('/api/events','POST',{...eventInput,departures:[{date:'2020-01-01',time:'14:00'}]},'admin');assert.equal(old.status,201);
 const event=(await h.req('/api/events')).data.events[0];
 assert.equal((await h.req(`/api/events/${event.id}/departures/${event.departures[0].id}/registrations`,'POST',{name:'Late',status:'whole',category:'GTE'})).status,409);
 for(let i=0;i<80;i++)assert.notEqual((await h.req('/api/guest/recover','POST',{token:'bad'},'spam')).status,429);
 assert.equal((await h.req('/api/guest/recover','POST',{token:'bad'},'spam')).status,429);
 assert.equal((await h.req('/api/events','POST',eventInput,'admin',{headers:{'Cookie':'__Host-em_session=forged'}})).status,401);
});
test('Paris timezone is stable across seasons and rejects ambiguous/nonexistent clock changes',async()=>{
 const h=harness();await h.login(ADMIN,'admin');
 for(const [date,expected] of [['2027-01-10','2027-01-10T14:00:00.000Z'],['2027-07-10','2027-07-10T13:00:00.000Z']]){
   const created=await h.req('/api/events','POST',{...eventInput,departures:[{date,time:'15:00'}]},'admin');
   assert.equal(created.status,201);
   const event=(await h.req('/api/events')).data.events.find(e=>e.id===created.data.id);
   assert.equal(new Date(event.departures[0].startsAt).toISOString(),expected);
 }
 for(const date of ['2027-03-28','2027-10-31'])assert.equal((await h.req('/api/events','POST',{...eventInput,departures:[{date,time:'02:30'}]},'admin')).status,400);
});
test('shortening preserves bookings and crews, rejecting hours outside the new duration',async()=>{
 const {req,login,DB}=harness();await login(ADMIN,'admin');
 await req('/api/events','POST',{...eventInput,durationHours:24},'admin');
 let event=(await req('/api/events')).data.events[0];
 const base=`/api/events/${event.id}/departures/${event.departures[0].id}`;
 const registration=await req(base+'/registrations','POST',{name:'Late pilot',category:'Hypercar',status:'h1,h24'},'admin');
 const crew=await req(base+'/crews','POST',{name:'Team',category:'Hypercar'},'admin');
 await req('/api/crews/'+crew.data.id+'/members','POST',{registrationId:registration.data.id,version:1},'admin');
 const before=DB.db.prepare('SELECT * FROM registrations').all();
 const rejected=await req('/api/events/'+event.id,'PATCH',{...event,durationMinutes:120},'admin');
 assert.equal(rejected.status,409);assert.match(rejected.data.error,/disponibilités/);
 assert.deepEqual(DB.db.prepare('SELECT * FROM registrations').all(),before);
 assert.equal(DB.db.prepare('SELECT duration_hours FROM events').get().duration_hours,24);
 assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM crew_members').get().n,1);
 assert.equal((await req('/api/registrations/'+registration.data.id,'PATCH',{name:'Late pilot',category:'Hypercar',status:'h1,h2',version:1},'admin')).status,200);
 assert.equal((await req('/api/events/'+event.id,'PATCH',{...event,durationMinutes:120},'admin')).status,200);
 event=(await req('/api/events','GET',null,'admin')).data.events[0];
 assert.equal(event.durationHours,2);assert.equal(event.departures[0].availability[0].status,'h1,h2');
 assert.deepEqual(event.departures[0].crews[0].registrationIds,[registration.data.id]);
 assert.equal((await req('/api/events/'+event.id,'PATCH',{...event,durationMinutes:60},'admin')).status,409);
 assert.equal((await req('/api/events/'+event.id,'PATCH',{...event,durationMinutes:1440},'admin')).status,200);
 // Durations with minutes: 2 h 30 gives 3 presence slots; the duration is kept in minutes.
 event=(await req('/api/events')).data.events[0];
 assert.equal((await req('/api/events/'+event.id,'PATCH',{...event,durationMinutes:150},'admin')).status,200);
 event=(await req('/api/events')).data.events[0];
 assert.equal(event.durationMinutes,150);assert.equal(event.durationHours,3);
 assert.equal((await req('/api/events/'+event.id,'PATCH',{...event,durationMinutes:152},'admin')).status,400);
 assert.equal((await req('/api/events/'+event.id,'PATCH',{...event,durationMinutes:1445},'admin')).status,400);
});
test('event list stays available beyond D1 bound-parameter limit',async()=>{
 const {req,login,DB}=harness();await login(ADMIN,'admin');
 const insertUser=DB.db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)');
 const insertEvent=DB.db.prepare(`INSERT INTO events(id,name,circuit,categories,departures,created_by,created_at) VALUES(?,?,'','["GT3"]',?,?,?)`);
 const insertParticipant=DB.db.prepare('INSERT INTO participants(id,name,user_id,created_by,created_at) VALUES(?,?,?,?,0)');
 const insertRegistration=DB.db.prepare(`INSERT INTO registrations(id,event_id,departure_id,user_id,owner_user_id,name,name_key,category,status,created_at,participant_id) VALUES(?,?,'d',?,?,?,?,'GT3','whole',0,?)`);
 for(let i=0;i<120;i++){
  const user=String(400000000000000000n+BigInt(i)),creator=String(500000000000000000n+BigInt(i)),suffix=String(i).padStart(12,'0');
  const eventId='00000000-0000-4000-8000-'+suffix,participantId='10000000-0000-4000-8000-'+suffix;
  insertUser.run(user,'Pilote '+i);insertUser.run(creator,'Createur '+i);
  insertEvent.run(eventId,'Course '+i,JSON.stringify([{id:'d',date:'2090-01-01',time:'20:00',startsAt:Date.UTC(2090,0,1)}]),ADMIN,i);
  insertParticipant.run(participantId,'Pilote '+i,user,creator);
  insertRegistration.run('20000000-0000-4000-8000-'+suffix,eventId,user,creator,'Pilote '+i,'pilote '+i,participantId);
 }
 const list=await req('/api/events','GET',null,'admin');
 assert.equal(list.status,200);
 assert.equal(list.data.events.length,120);
 assert.equal(list.data.events.reduce((total,event)=>total+event.departures[0].availability.length,0),120);
 assert.equal(list.data.events.find(event=>event.name==='Course 7').departures[0].availability[0].addedByName,'Createur 7');
 assert.equal((await req('/api/events?game=lmu')).data.events.length,120);
 assert.equal((await req('/api/events?game=iracing')).data.events.length,0);
 // Public name of the race API (ad blockers block "/api/events"); the old address keeps working.
 assert.equal((await req('/api/races?game=lmu')).data.events.length,120);
});
test('organizer-created crews stay ownerless across worker cold starts',async()=>{
 const {req,login,DB,env,jars}=harness();await login(ADMIN,'admin');await login(PILOT,'pilot');
 await req('/api/events','POST',eventInput,'admin');
 const event=(await req('/api/events')).data.events[0],base=`/api/events/${event.id}/departures/${event.departures[0].id}`;
 const reg=await req(base+'/registrations','POST',{name:'Pilote',category:'GTE',status:'whole'},'pilot');assert.equal(reg.status,201);
 DB.db.exec("ALTER TABLE crews ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
 const cookie=Object.entries(jars.get('pilot')).map(([k,v])=>`${k}=${v}`).join('; ');
 const listAsPilot=async()=>(await (await workerWithMigrations.fetch(new Request(ROOT+'/api/events',{headers:{Cookie:cookie}}),env,{waitUntil(){}})).json()).events[0].departures[0].crews[0];
 const crew=await req(base+'/crews','POST',{name:'Orga',category:'GTE'},'admin');assert.equal(crew.status,201);
 assert.equal((await req('/api/crews/'+crew.data.id+'/members','POST',{registrationId:reg.data.id,version:1},'admin')).status,200);
 const listed=await listAsPilot();
 assert.deepEqual(listed.registrationIds,[reg.data.id]);
 assert.equal(listed.hasOwner,false);assert.equal(listed.ownedByMe,false);assert.equal(listed.canManage,false);
 assert.equal(DB.db.prepare('SELECT owner_user_id o FROM crews WHERE id=?').get(crew.data.id).o,null);
});
test('Discord login returns to the same-site page and race it started from',async()=>{
 const {req}=harness();
 const eventId='12345678-1234-4123-8123-123456789abc';
 async function loginFrom(returnValue,actor){
  const start=await req('/api/auth/discord?return='+encodeURIComponent(returnValue),'GET',null,actor);assert.equal(start.status,302);
  const state=new URL(start.response.headers.get('Location')).searchParams.get('state');
  const realFetch=globalThis.fetch;
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/token')?{access_token:'mock'}:{id:PILOT,username:'Pilote'}),{headers:{'Content-Type':'application/json'}});
  try{
   const callback=await req('/api/auth/discord/callback?code=test&state='+state,'GET',null,actor);
   assert.match(callback.response.headers.getSetCookie().join('\n'),/__Host-em_return=; [^\n]*Max-Age=0/);
   return callback.response.headers.get('Location');
  }finally{globalThis.fetch=realFetch;}
 }
 assert.equal(await loginFrom('/lmu/#event='+eventId,'a'),ROOT+'/lmu/#event='+eventId);
 assert.equal(await loginFrom('/iracing/','b'),ROOT+'/iracing/');
 assert.equal(await loginFrom('/lmu/#inscriptions','b2'),ROOT+'/lmu/#inscriptions');
 for(const [i,unsafe] of ['//evil.example/','https://evil.example/','/\\evil.example','/lmu/?next=//evil','/lmu/#event=<script>','javascript:alert(1)'].entries())
  assert.equal(await loginFrom(unsafe,'c'+i),ROOT+'/',unsafe);
});
test('events can be flagged with a schedule still to confirm',async()=>{
 const {req,login}=harness();await login(ADMIN,'admin');
 assert.equal((await req('/api/events','POST',{...eventInput,schedulePending:true},'admin')).status,201);
 let event=(await req('/api/events')).data.events[0];
 assert.equal(event.schedulePending,true);
 const departures=event.departures.map(({id,date,time})=>({id,date,time}));
 assert.equal((await req('/api/events/'+event.id,'PATCH',{...eventInput,departures,version:event.version},'admin')).status,200);
 event=(await req('/api/events')).data.events[0];
 assert.equal(event.schedulePending,true,'omitting the flag keeps it');
 assert.equal((await req('/api/events/'+event.id,'PATCH',{...eventInput,departures,schedulePending:false,version:event.version},'admin')).status,200);
 assert.equal((await req('/api/events')).data.events[0].schedulePending,false);
});
test('schedule migration moves the "(horaires ...)" suffix out of event names',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE events(id TEXT PRIMARY KEY,name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1)");
 db.exec("INSERT INTO events(id,name) VALUES('a','6h FUJI (horaires non définies par LMU)'),('b','12h du Mans'),('c','8h BAHRAIN  (Horaires à venir)')");
 db.exec(readFileSync(new URL('../migrations/0026_event_schedule_pending.sql',import.meta.url),'utf8'));
 assert.deepEqual(db.prepare('SELECT id,name,schedule_pending p,version v FROM events ORDER BY id').all().map(r=>({...r})),[
  {id:'a',name:'6h FUJI',p:1,v:2},{id:'b',name:'12h du Mans',p:0,v:1},{id:'c',name:'8h BAHRAIN',p:1,v:2}]);
});
test('events can be listed by scope so the archive is only loaded on demand',async()=>{
 const {req,login,DB}=harness();await login(ADMIN,'admin');
 const upcoming=(await req('/api/events','POST',{...eventInput,name:'Course à venir'},'admin')).data.id;
 const past=(await req('/api/events','POST',{...eventInput,name:'Course passée'},'admin')).data.id;
 const row=DB.db.prepare('SELECT departures FROM events WHERE id=?').get(past);
 const departures=JSON.parse(row.departures).map((d,i)=>({...d,startsAt:Date.now()-(3+i)*86400000}));
 DB.db.prepare('UPDATE events SET departures=? WHERE id=?').run(JSON.stringify(departures),past);
 const ids=async scope=>(await req('/api/events'+(scope?`?scope=${scope}`:''))).data.events.map(e=>e.id).sort();
 assert.deepEqual(await ids('upcoming'),[upcoming]);
 assert.deepEqual(await ids('archived'),[past]);
 assert.deepEqual(await ids(''),[upcoming,past].sort());
 assert.equal((await req('/api/events?scope=upcoming')).response.headers.get('X-Endurance-Scope'),'upcoming');
});
test('the scheduled job purges expired rate-limit counters and sessions',async()=>{
 const {DB,env}=harness();
 const past=Math.floor(Date.now()/1000)-60,future=past+7200;
 DB.db.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,?,?),(?,?,?)').run('old',1,past,'fresh',1,future);
 const pending=[];
 await workerWithMigrations.scheduled({},env,{waitUntil:promise=>pending.push(promise)});
 await Promise.all(pending);
 assert.deepEqual(DB.db.prepare('SELECT key FROM rate_limits ORDER BY key').all().map(row=>row.key),['fresh']);
});

const soloInput={name:'Sprint du jeudi',format:'solo',access:'open',capacity:2,rounds:[{circuit:'spa',durationMinutes:20},{circuit:'random',durationMinutes:20}],categories:['Hypercar','GT3'],departures:[{date:'2090-10-15',time:'21:00'}]};
test('solo race: places, waiting list, one entry per driver, no crews',async()=>{
 const {req,login}=harness();await login(ADMIN,'admin');await login(PILOT,'pilot');await login(OTHER,'other');
 const created=await req('/api/events','POST',soloInput,'admin');assert.equal(created.status,201,JSON.stringify(created.data));
 let event=(await req('/api/events')).data.events.find(e=>e.id===created.data.id);
 assert.equal(event.format,'solo');assert.equal(event.capacity,2);assert.equal(event.durationHours,1);assert.equal(event.circuit,'spa');
 assert.deepEqual(event.rounds,[{circuit:'spa',durationMinutes:20,categories:['Hypercar','GT3']},{circuit:'random',durationMinutes:20,categories:['Hypercar','GT3']}]);
 const path=`/api/events/${event.id}/departures/${event.departures[0].id}/registrations`;
 assert.equal((await req(path,'POST',{name:'Invité',choices:[{category:'GT3',carAny:true},{category:'GT3',carAny:true}]})).status,401,'guests cannot enter a solo race');
 assert.equal((await req(path,'POST',{name:'Admin',choices:[{category:'*'},{category:'*'}]},'admin')).status,201);
 const pilot=await req(path,'POST',{name:'Pilote',choices:[{category:'GT3',cars:['Ferrari 296 LMGT3']},{category:'GT3',carAny:true}]},'pilot');assert.equal(pilot.status,201);
 assert.equal((await req(path,'POST',{name:'Autre',choices:[{category:'Hypercar',carAny:true},{category:'Hypercar',carAny:true}]},'other')).status,201);
 assert.equal((await req(path,'POST',{name:'Pilote',choices:[{category:'Hypercar',carAny:true},{category:'Hypercar',carAny:true}]},'pilot')).status,409,'one entry per driver');
 event=(await req('/api/events')).data.events.find(e=>e.id===created.data.id);
 const regs=event.departures[0].availability;
 assert.deepEqual(regs.map(r=>r.waitlistPosition),[null,null,1]);
 assert.equal(regs[0].category,'*');assert.equal(regs[0].carAny,true);assert.equal(regs[0].status,'whole');
 // The pilot withdraws: the first driver waiting gets the place.
 const mine=regs.find(r=>r.id===pilot.data.id);
 assert.equal((await req('/api/registrations/'+mine.id,'DELETE',{version:mine.version},'pilot')).status,200);
 event=(await req('/api/events')).data.events.find(e=>e.id===created.data.id);
 assert.deepEqual(event.departures[0].availability.map(r=>r.waitlistPosition),[null,null]);
 const crew=await req(`/api/events/${event.id}/departures/${event.departures[0].id}/crews`,'POST',{name:'Équipe',category:'GT3'},'admin');
 assert.equal(crew.status,409,'no crews in solo races');
 // Bad solo definitions are refused.
 for(const bad of [{...soloInput,rounds:[]},{...soloInput,capacity:1},{...soloInput,rounds:[{circuit:'spa',durationMinutes:2}]},{...soloInput,departures:[...soloInput.departures,{date:'2090-10-16',time:'21:00'}]},{...soloInput,rounds:[{circuit:'spa',durationMinutes:20},{circuit:'iracing-spa',durationMinutes:20}]}])
  assert.equal((await req('/api/events','POST',bad,'admin')).status,400);
});
test('SAFE solo races are reserved to drivers marked SAFE by an administrator',async()=>{
 const {req,login}=harness();await login(ADMIN,'admin');await login(PILOT,'pilot');
 const created=await req('/api/events','POST',{...soloInput,access:'safe'},'admin');
 const event=(await req('/api/events')).data.events.find(e=>e.id===created.data.id);
 assert.equal(event.access,'safe');
 const path=`/api/events/${event.id}/departures/${event.departures[0].id}/registrations`;
 assert.equal((await req(path,'POST',{name:'Pilote',choices:[{category:'GT3',carAny:true},{category:'GT3',carAny:true}]},'pilot')).status,403);
 assert.equal((await req('/api/members/'+PILOT,'PATCH',{safe:true},'pilot')).status,403,'only administrators mark drivers SAFE');
 assert.equal((await req('/api/members/'+PILOT,'PATCH',{safe:true},'admin')).status,200);
 assert.equal((await req('/api/session','GET',null,'pilot')).data.user.safe,true);
 assert.equal((await req(path,'POST',{name:'Pilote',choices:[{category:'GT3',carAny:true},{category:'GT3',carAny:true}]},'pilot')).status,201);
});
test('solo race with two rounds: categories per round, one choice per round',async()=>{
 const {req,login}=harness();await login(ADMIN,'admin');await login(PILOT,'pilot');
 const input={...soloInput,capacity:10,rounds:[{circuit:'spa',durationMinutes:20,categories:['GT3']},{circuit:'random',durationMinutes:20,categories:['Hypercar','LMP2 ELMS']}],categories:[]};
 const created=await req('/api/events','POST',input,'admin');assert.equal(created.status,201,JSON.stringify(created.data));
 let event=(await req('/api/events')).data.events.find(e=>e.id===created.data.id);
 assert.deepEqual(event.rounds.map(r=>r.categories),[['GT3'],['Hypercar','LMP2 ELMS']]);
 assert.deepEqual(event.categories.sort(),['GT3','Hypercar','LMP2 ELMS']);
 const path=`/api/events/${event.id}/departures/${event.departures[0].id}/registrations`;
 assert.equal((await req(path,'POST',{name:'Pilote',choices:[{category:'Hypercar',carAny:true},{category:'Hypercar',carAny:true}]},'pilot')).status,400,'round 1 is GT3 only');
 assert.equal((await req(path,'POST',{name:'Pilote',choices:[{category:'GT3',carAny:true}]},'pilot')).status,400,'one choice per round');
 const ok=await req(path,'POST',{name:'Pilote',choices:[{category:'GT3',cars:['Ferrari 296 LMGT3']},{category:'*'}]},'pilot');assert.equal(ok.status,201,JSON.stringify(ok.data));
 event=(await req('/api/events')).data.events.find(e=>e.id===created.data.id);
 const reg=event.departures[0].availability[0];
 assert.equal(reg.category,'GT3');
 assert.deepEqual(reg.roundChoices,[{category:'GT3',cars:['Ferrari 296 LMGT3'],carAny:false},{category:'*',cars:[],carAny:true}]);
 const edited=await req('/api/registrations/'+reg.id,'PATCH',{name:'Pilote',version:reg.version,choices:[{category:'GT3',carAny:true},{category:'LMP2 ELMS',carAny:true}]},'pilot');
 assert.equal(edited.status,200,JSON.stringify(edited.data));
 event=(await req('/api/events')).data.events.find(e=>e.id===created.data.id);
 assert.equal(event.departures[0].availability[0].roundChoices[1].category,'LMP2 ELMS');
});

test('official iRacing endurances are imported once, by the daily task or by an admin', async t => {
 const {req,login,DB}=harness();await login(ADMIN,'admin');await login(PILOT,'pilot');
 const realFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=realFetch;});
 // Far-future dates: every week of the test season is still to come.
 const future=JSON.parse(JSON.stringify(SEASON).replaceAll('2026-','2099-'));
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('manifest.json')?{current:'2099S4'}:future));
 assert.equal((await req('/api/admin/iracing-import','POST',{},'pilot')).status,403);
 const first=await req('/api/admin/iracing-import','POST',{},'admin');
 assert.equal(first.status,200);assert.ok(first.data.created>=4);
 const events=(await req('/api/races?game=iracing')).data.events;
 assert.equal(events.length,first.data.created);
 const imsa=events.find(event=>event.name==='IMSA Endurance Series'&&event.circuit==='iracing-long-beach');
 assert.equal(imsa.departures.length,4);assert.equal(imsa.durationMinutes,160);
 assert.ok(events.some(event=>event.schedulePending&&event.eventType==='special'));
 // Run again: nothing new. Delete a race: it is not created again.
 assert.equal((await req('/api/admin/iracing-import','POST',{},'admin')).data.created,0);
 assert.equal((await req('/api/events/'+imsa.id,'DELETE',{version:imsa.version},'admin')).status,200);
 assert.equal((await req('/api/admin/iracing-import','POST',{},'admin')).data.created,0);
 // The import account never shows up among the pilots or the members.
 assert.ok(!(await req('/api/members','GET',null,'admin')).data.members.some(member=>member.id==='system:iracing'));
 assert.ok(!(await req('/api/participants','GET',null,'pilot')).data.participants.some(member=>member.id==='system:iracing'));
 assert.ok(DB.db.prepare("SELECT COUNT(*) n FROM iracing_imports").get().n>=4);
 // The article of the race week gives the special event its time slots (Indianapolis: 2099-10-16 → 18).
 const article={date:'2099-10-12T09:00:00',title:{rendered:'THIS WEEK: iRacing 8 Hours of Indianapolis | Special Event'},content:{rendered:'<p>Timeslot #1: Friday at 22:00 GMT</p><p>Timeslot #2: Saturday at 12:00 GMT</p>'}};
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('wp-json')?[article]:String(url).endsWith('manifest.json')?{current:'2099S4'}:future));
 let indy=(await req('/api/races?game=iracing')).data.events.find(event=>event.name==='8 Hours of Indianapolis');
 assert.equal(indy.schedulePending,true);
 // Time not known yet: one common "Horaire à définir" start, where pilots enter and form crews.
 assert.equal(indy.departures.length,1);assert.equal(indy.departures[0].tbd,true);
 const pool=indy.departures[0];
 const leo=await req(`/api/events/${indy.id}/departures/${pool.id}/registrations`,'POST',{name:'Leo',category:'GT3',status:'whole'},'pilot');
 const max=await req(`/api/events/${indy.id}/departures/${pool.id}/registrations`,'POST',{name:'Max',category:'GT3',status:'whole'},'admin');
 const crew=await req(`/api/events/${indy.id}/departures/${pool.id}/crews`,'POST',{name:'Team',category:'GT3'},'admin');
 assert.equal((await req('/api/crews/'+crew.data.id+'/members','POST',{registrationId:max.data.id,version:1},'admin')).status,200);
 // The official slots arrive: the common start stays (closing with the first slot), the slots are added.
 await req('/api/admin/iracing-import','POST',{},'admin');
 indy=(await req('/api/races?game=iracing')).data.events.find(event=>event.name==='8 Hours of Indianapolis');
 assert.equal(indy.schedulePending,false);
 assert.deepEqual(indy.departures.map(d=>`${d.date} ${d.time}${d.tbd?' tbd':''}`),['2099-10-17 00:00 tbd','2099-10-17 00:00','2099-10-17 14:00'],'Friday 22:00 GMT is Saturday midnight in Paris');
 const [common,slotA,slotB]=indy.departures;
 assert.equal(common.id,pool.id);assert.equal(common.availability.length,2);
 // The crew picks its start and moves there with its pilots; a pilot without crew picks theirs.
 const team=common.crews[0];
 assert.equal((await req('/api/crews/'+team.id,'PATCH',{departureId:common.id,version:team.version},'admin')).status,400,'not the common start');
 assert.equal((await req('/api/crews/'+team.id,'PATCH',{departureId:slotB.id,version:team.version},'admin')).status,200);
 const leoReg=common.availability.find(reg=>reg.name==='Leo');
 assert.equal((await req('/api/registrations/'+leoReg.id+'/departure','PATCH',{departureId:slotA.id,version:leoReg.version},'pilot')).status,200);
 indy=(await req('/api/races?game=iracing')).data.events.find(event=>event.name==='8 Hours of Indianapolis');
 const [after,slot1,slot2]=indy.departures;
 assert.equal(after.availability.length,0);assert.equal(after.crews.length,0);
 assert.deepEqual(slot1.availability.map(reg=>reg.name),['Leo']);
 assert.deepEqual(slot2.availability.map(reg=>reg.name),['Max']);assert.equal(slot2.crews[0].registrationIds[0],max.data.id);
 // A start that already has its time cannot be left this way.
 const leoAfter=slot1.availability[0];
 assert.equal((await req('/api/registrations/'+leoAfter.id+'/departure','PATCH',{departureId:slotB.id,version:leoAfter.version},'pilot')).status,409);
});

test('a driver can race an endurance alone; organizers set whether a driver change is required', async () => {
 const {req,login}=harness();await login(ADMIN,'admin');await login(PILOT,'pilot');
 await req('/api/events','POST',{...eventInput,circuit:'iracing-spa',categories:['GT3'],durationMinutes:180,driverChangeRequired:true},'admin');
 let event=(await req('/api/events?game=iracing')).data.events[0];
 assert.equal(event.driverChangeRequired,true);
 const base=`/api/events/${event.id}/departures/${event.departures[0].id}`;
 const reg=await req(base+'/registrations','POST',{name:'Leo',category:'GT3',status:'h1',soloDriver:true},'pilot');
 assert.equal(reg.status,201);
 event=(await req('/api/events?game=iracing')).data.events[0];
 const saved=event.departures[0].availability[0];
 assert.equal(saved.soloDriver,true);assert.equal(saved.status,'whole','alone means the whole race');
 // Back to a team: the flag is cleared.
 assert.equal((await req('/api/registrations/'+reg.data.id,'PATCH',{name:'Leo',category:'GT3',status:'h1',soloDriver:false,version:saved.version},'pilot')).status,200);
 event=(await req('/api/events?game=iracing')).data.events[0];
 assert.equal(event.departures[0].availability[0].soloDriver,false);
 // Editing the race without the field keeps the organizer's choice.
 const {driverChangeRequired,...rest}=event;
 assert.equal((await req('/api/events/'+event.id,'PATCH',rest,'admin')).status,200);
 assert.equal((await req('/api/events?game=iracing')).data.events[0].driverChangeRequired,true);
});

test('solo races and SAFE drivers stay off where SOLO_RACES is not "on" (production)', async () => {
 const {req,login,env,DB}=harness();await login(ADMIN,'admin');await login(PILOT,'pilot');
 const solo=soloInput;
 assert.equal((await req('/api/events','POST',solo,'admin')).status,201,'on: allowed');
 delete env.SOLO_RACES;
 assert.equal((await req('/api/session','GET',null,'pilot')).data.soloRaces,false);
 assert.equal((await req('/api/events','POST',solo,'admin')).status,400);
 assert.equal((await req('/api/events')).data.events.length,0,'existing solo races are hidden');
 assert.equal(DB.db.prepare("SELECT COUNT(*) n FROM events WHERE format='solo'").get().n,1,'but kept');
 assert.equal((await req('/api/members/'+PILOT,'PATCH',{safe:true},'admin')).status,404);
 assert.equal((await req('/api/events','POST',eventInput,'admin')).status,201,'endurances unchanged');
});
