import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {notify, purgeNotifications} from '../server/notifications.mjs';
import {linkTestServer, setMember, ORGA_ROLE} from './fixtures/discord-server.mjs';

// Notifications of the bell (migration 0043), with every migration applied and two communities.
const ROOT='https://site.example';
const ADMIN='111111111111111111', PILOT='222222222222222222', MATE='333333333333333333';
const DEV='e0a1c0de-0000-4000-8000-000000000001', TEST='e0a1c0de-0000-4000-8000-000000000002';
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();

class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}

function harness(){
  const DB=new D1();
  DB.db.prepare("INSERT INTO communities(id,slug,name,short_name,created_at) VALUES(?,'commu-test','Commu Test','TEST',0)").run(TEST);
  linkTestServer(DB.db, DEV);
  DB.db.prepare("UPDATE communities SET discord_guild_id='900000000000000009' WHERE id=?").run(TEST);
  const env={DB,APP_ORIGIN:ROOT,COMMUNITY:'commu-dev',DISCORD_CLIENT_ID:'app-id',DISCORD_CLIENT_SECRET:'test-only-secret',ADMIN_DISCORD_IDS:ADMIN,ASSETS:{fetch:async()=>new Response('static')}};
  const jars=new Map();
  async function req(path,method='GET',data,actor='guest'){
    const jar=jars.get(actor)||{};
    const headers={'CF-Connecting-IP':actor,'Cookie':Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; ')};
    if(method!=='GET'){headers.Origin=ROOT;headers['Content-Type']='application/json';}
    const response=await worker.fetch(new Request(ROOT+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(data||{})}),env);
    for(const raw of response.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');const name=pair.slice(0,i),value=pair.slice(i+1);if(value)jar[name]=value;else delete jar[name];}
    jars.set(actor,jar);
    return {status:response.status,data:await response.clone().json().catch(()=>null)};
  }
  async function login(discordId,actor,name){
    const start=await worker.fetch(new Request(ROOT+'/api/auth/discord',{headers:{'CF-Connecting-IP':actor}}),env);
    const state=new URL(start.headers.get('Location')).searchParams.get('state');
    const jar={};for(const raw of start.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');jar[pair.slice(0,i)]=pair.slice(i+1);}jars.set(actor,jar);
    const realFetch=globalThis.fetch;
    globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/token')?{access_token:'mock'}:{id:discordId,username:name}),{headers:{'Content-Type':'application/json'}});
    try{await req(`/api/auth/discord/callback?code=test&state=${state}`,'GET',null,actor);}finally{globalThis.fetch=realFetch;}
    for(const community of [DEV,TEST])setMember(DB.db,discordId,discordId===ADMIN?[ORGA_ROLE]:[],{communityId:community});
  }
  return {DB,env,req,login};
}
const race={name:'6h SPA',circuit:'spa',categories:['Hypercar','GT3'],departures:[{date:'2090-10-15',time:'20:00'}]};
const kinds=async (req,actor)=>(await req('/api/notifications','GET',null,actor)).data.notifications.map(item=>item.kind);

test('the pilots of a start and of a crew are told what happens, never the one who does it', async () => {
  const {req,login,env}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  let event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`;
  const first=await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot');assert.equal(first.status,201,JSON.stringify(first.data));
  assert.deepEqual(await kinds(req,'pilot'),[],'nobody else on the start yet');
  const mate=await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'mate');assert.equal(mate.status,201);
  let list=(await req('/api/notifications','GET',null,'pilot')).data;
  assert.equal(list.unread,1);
  assert.deepEqual({kind:list.notifications[0].kind,pilot:list.notifications[0].pilot,eventName:list.notifications[0].eventName,game:list.notifications[0].game,startsAt:list.notifications[0].startsAt},
    {kind:'entry',pilot:'Bob',eventName:'6h SPA',game:'lmu',startsAt:departure.startsAt});
  assert.deepEqual(await kinds(req,'mate'),[],'the one who enters is not told');
  // Another category on the same start: the others were already told.
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'Hypercar',status:'whole'},'mate')).status,201);
  assert.deepEqual(await kinds(req,'pilot'),['entry']);
  // A crew: the pilot who joins tells its pilots; the one who leaves too.
  const crew=await req(base+'/crews','POST',{name:'Les Tondeuz',category:'GT3'},'pilot');assert.equal(crew.status,201);
  let crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:mate.data.id,version:crewRow.version,selfJoin:true},'mate')).status,200);
  list=(await req('/api/notifications','GET',null,'pilot')).data;
  assert.equal(list.notifications[0].kind,'crew_join');assert.equal(list.notifications[0].crewName,'Les Tondeuz');assert.equal(list.notifications[0].pilot,'Bob');
  crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}/members/${mate.data.id}`,'DELETE',{version:crewRow.version},'mate')).status,200);
  assert.equal((await kinds(req,'pilot'))[0],'crew_leave');
  // The crew gets a car: its pilots are told, not when only its name changes.
  crewRow=(await req('/api/events','GET',null,'admin')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}`,'PATCH',{name:'Les Tondeuz',category:'GT3',car:'Ferrari 296 LMGT3',version:crewRow.version},'admin')).status,200);
  list=(await req('/api/notifications','GET',null,'pilot')).data;
  assert.deepEqual({kind:list.notifications[0].kind,car:list.notifications[0].car,by:list.notifications[0].by},{kind:'crew_car',car:'Ferrari 296 LMGT3',by:'Orga'});
  crewRow=(await req('/api/events','GET',null,'admin')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}`,'PATCH',{name:'Tondeuz',category:'GT3',car:'Ferrari 296 LMGT3',version:crewRow.version},'admin')).status,200);
  assert.equal((await kinds(req,'pilot')).filter(kind=>kind==='crew_car').length,1);
  // Bell opened: everything read.
  assert.equal((await req('/api/notifications/read','POST',{},'pilot')).status,200);
  assert.equal((await req('/api/notifications','GET',null,'pilot')).data.unread,0);
  // The race changes its start: every pilot entered is told, not the organizer who changed it.
  event=(await req('/api/events','GET',null,'admin')).data.events[0];
  assert.equal((await req(`/api/events/${event.id}`,'PATCH',{...event,name:'6h de Spa'},'admin')).status,200);
  for(const actor of ['pilot','mate']){const item=(await req('/api/notifications','GET',null,actor)).data.notifications[0];assert.equal(item.kind,'race_changed');assert.deepEqual(item.changes,['name']);assert.equal(item.eventName,'6h de Spa');}
  assert.deepEqual(await kinds(req,'admin'),[]);
  // Nothing to tell when nothing that matters changed.
  event=(await req('/api/events','GET',null,'admin')).data.events[0];
  assert.equal((await req(`/api/events/${event.id}`,'PATCH',{...event},'admin')).status,200);
  assert.equal((await kinds(req,'mate')).filter(kind=>kind==='race_changed').length,1);
  // An organizer takes a pilot off: he is told.
  const entry=(await req('/api/events','GET',null,'admin')).data.events[0].departures[0].availability.find(reg=>reg.name==='Bob');
  assert.equal((await req(`/api/registrations/${entry.id}`,'DELETE',{version:entry.version},'admin')).status,200);
  assert.equal((await kinds(req,'mate'))[0],'removed_by');
  // The race is deleted: its pilots are told; the notification stays without the race.
  event=(await req('/api/events','GET',null,'admin')).data.events[0];
  assert.equal((await req(`/api/events/${event.id}`,'DELETE',{version:event.version},'admin')).status,200);
  assert.equal((await kinds(req,'pilot'))[0],'race_deleted');
  // Another community's site never shows them (its races are private).
  env.COMMUNITY='commu-test';
  assert.deepEqual(await kinds(req,'pilot'),[]);
  assert.equal((await req('/api/notifications','GET',null,'guest')).status,401);
});

test('a notification never stops the action, and old ones go', async () => {
  const broken={DB:{prepare(){throw new Error('no such table: notifications');}}};
  const realError=console.error;console.error=()=>{};
  try{assert.equal(await notify(broken,[{user_id:PILOT,community_id:DEV}],'entry',{id:'e',name:'Race'}),0);}finally{console.error=realError;}
  const {DB}=harness();
  DB.db.prepare("INSERT INTO users(id,name,created_at) VALUES(?,'Alice',0)").run(PILOT);
  const old=Math.floor(Date.now()/1000)-31*86400;
  DB.db.prepare("INSERT INTO notifications(id,user_id,community_id,kind,data,created_at) VALUES('old',?,?,'entry','{}',?),('new',?,?,'entry','{}',?)").run(PILOT,DEV,old,PILOT,DEV,old+2*86400);
  await purgeNotifications({DB});
  assert.deepEqual(DB.db.prepare('SELECT id FROM notifications').all().map(row=>row.id),['new']);
});
