import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';

const ROOT='https://fmt.example';
const ADMIN='111111111111111111';
const PILOT='222222222222222222';
const TEAMMATE='333333333333333333';
const MIGRATIONS=[
  '0001_initial.sql','0002_event_duration.sql','0003_event_type.sql','0004_crews.sql',
  '0005_registration_preference.sql','0006_registration_car.sql','0007_registration_car_preferences.sql',
  '0008_event_circuit.sql','0009_registration_owner.sql','0011_multi_category_registrations.sql',
  '0012_participants.sql','0013_allow_assigned_category_interests.sql','0014_lock_categories_after_crew_assignment.sql',
  '0015_crew_lock.sql','0016_crew_ownership.sql'
];

class D1 {
  constructor(){
    this.db=new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys=ON;');
    for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  }
  prepare(sql){
    const self=this;
    return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {success:true,meta:{changes:Number(result.changes)}};}};
  }
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}

function harness(){
  const DB=new D1();
  const env={DB,APP_ORIGIN:ROOT,DISCORD_CLIENT_ID:'app-id',DISCORD_CLIENT_SECRET:'test-only-secret',ADMIN_DISCORD_IDS:ADMIN,ASSETS:{fetch:async()=>new Response('static')}};
  const jars=new Map();
  async function req(path,method='GET',data,actor='guest'){
    const jar=jars.get(actor)||{};
    const headers={'CF-Connecting-IP':actor,'Cookie':Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; ')};
    if(method!=='GET'){headers.Origin=ROOT;headers['Content-Type']='application/json';}
    const response=await worker.fetch(new Request(ROOT+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(data||{})}),env);
    for(const raw of response.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');const name=pair.slice(0,i),value=pair.slice(i+1);if(value)jar[name]=value;else delete jar[name];}
    jars.set(actor,jar);
    return {status:response.status,data:await response.clone().json().catch(()=>null),response};
  }
  async function login(discordId,actor){
    const start=await req('/api/auth/discord','GET',null,actor);assert.equal(start.status,302);
    const authUrl=new URL(start.response.headers.get('Location'));
    const realFetch=globalThis.fetch;
    globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/token')?{access_token:'mock'}:{id:discordId,username:`Pilot ${discordId}`}),{headers:{'Content-Type':'application/json'}});
    try{const callback=await req(`/api/auth/discord/callback?code=test&state=${authUrl.searchParams.get('state')}`,'GET',null,actor);assert.equal(callback.status,302);}finally{globalThis.fetch=realFetch;}
  }
  return {DB,req,login};
}

test('registered pilots can create join leave and manage crews without event organizer rights',async()=>{
  const {req,login}=harness();
  await login(ADMIN,'admin');await login(PILOT,'pilot');await login(TEAMMATE,'teammate');
  const eventInput={name:'Self service',categories:['Hypercar'],departures:[{date:'2090-10-15',time:'15:00'}]};
  assert.equal((await req('/api/events','POST',eventInput,'admin')).status,201);
  assert.equal((await req('/api/events','POST',eventInput,'pilot')).status,403);
  const event=(await req('/api/events','GET',null,'pilot')).data.events[0];
  const dep=event.departures[0];
  const base=`/api/events/${event.id}/departures/${dep.id}`;

  const mine=await req(base+'/registrations','POST',{name:'Pilot owner',category:'Hypercar',status:'whole'},'pilot');
  assert.equal(mine.status,201);
  const created=await req(base+'/crews','POST',{name:'Crew pilot',category:'Hypercar',car:'Ferrari 499P'},'pilot');
  assert.equal(created.status,201);assert.equal(created.data.joined,true);

  let listing=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal(listing.ownedByMe,true);assert.equal(listing.canManage,true);assert.deepEqual(listing.registrationIds,[mine.data.id]);

  const teammate=await req(base+'/registrations','POST',{name:'Teammate',category:'Hypercar',status:'whole'},'teammate');
  assert.equal(teammate.status,201);
  assert.equal((await req(`/api/crews/${created.data.id}/members`,'POST',{registrationId:teammate.data.id,version:listing.version},'teammate')).status,403);
  const joined=await req(`/api/crews/${created.data.id}/members`,'POST',{registrationId:teammate.data.id,version:listing.version,selfJoin:true},'teammate');
  assert.equal(joined.status,200);

  listing=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal(listing.registrationIds.length,2);
  assert.equal((await req(`/api/crews/${created.data.id}`,'PATCH',{name:'Hack',category:'Hypercar',car:'',version:listing.version},'teammate')).status,403);
  assert.equal((await req(`/api/crews/${created.data.id}`,'PATCH',{name:'Crew renamed',category:'Hypercar',car:'Ferrari 499P',version:listing.version},'pilot')).status,200);

  listing=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${created.data.id}`,'PATCH',{locked:true,version:listing.version},'pilot')).status,200);
  listing=(await req('/api/events','GET',null,'teammate')).data.events[0].departures[0].crews[0];
  assert.equal(listing.locked,true);assert.equal(listing.canManage,false);

  const left=await req(`/api/crews/${created.data.id}/members/${teammate.data.id}`,'DELETE',{version:listing.version},'teammate');
  assert.equal(left.status,200);
  listing=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal(listing.locked,false);assert.deepEqual(listing.registrationIds,[mine.data.id]);
});
