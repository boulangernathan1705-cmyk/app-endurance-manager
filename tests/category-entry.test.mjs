import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {linkTestServer, setMember, DEV_COMMUNITY} from './fixtures/discord-server.mjs';
const CREW_ROLE='900000000000000009';

const ROOT='https://site.example';
const ADMIN='111111111111111111';
const PILOT='222222222222222222';
const TEAMMATE='333333333333333333';
const MIGRATIONS=[
  '0001_initial.sql','0002_event_duration.sql','0003_event_type.sql','0004_crews.sql',
  '0005_registration_preference.sql','0006_registration_car.sql','0007_registration_car_preferences.sql',
  '0008_event_circuit.sql','0009_registration_owner.sql','0011_multi_category_registrations.sql',
  '0012_participants.sql','0013_allow_assigned_category_interests.sql','0014_lock_categories_after_crew_assignment.sql',
  '0015_crew_lock.sql','0016_crew_ownership.sql','0016_client_errors.sql','0017_discord_weekly.sql','0026_event_schedule_pending.sql','0027_solo_races.sql','0028_solo_round_choices.sql','0029_event_duration_minutes.sql','0030_iracing_import.sql','0031_solo_driver.sql','0054_event_sim.sql','0055_event_absences.sql','0032_tbd_imported_specials.sql','0033_lmu_pending_common_start.sql','0034_communities.sql','0035_memberships.sql','0036_commu_dev_discord.sql','0057_event_last_start.sql','0058_event_last_start_undated.sql','0059_grindfest.sql','0063_registration_comment.sql'
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
  linkTestServer(DB.db);
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
    setMember(DB.db,discordId);
  }
  return {DB,req,login};
}
// « Inscription par catégorie »: a pilot entered on several starts keeps only the start of his crew.
async function raceWithTwoStarts(req){
  await req('/api/events','POST',{name:'Multi',categories:['Hypercar','GT3'],departures:[{date:'2090-10-15',time:'15:00'},{date:'2090-10-16',time:'09:00'}]},'admin');
  const event=(await req('/api/events','GET',null,'pilot')).data.events[0];
  const [first,second]=event.departures;
  const enter=(dep,category)=>req(`/api/events/${event.id}/departures/${dep.id}/registrations`,'POST',{name:'Pilot',category,status:'whole'},'pilot');
  return {event,first,second,enter};
}
const entriesOf=async(req,eventId)=>(await req('/api/events','GET',null,'pilot')).data.events.find(item=>item.id===eventId).departures.map(dep=>dep.availability.filter(reg=>reg.mine).map(reg=>reg.category).sort());

test('with the module on, placing a pilot in a crew removes his entries on the other starts',async()=>{
  const {req,login}=harness();
  await login(ADMIN,'admin');await login(PILOT,'pilot');
  assert.equal((await req('/api/community/modules','PATCH',{categoryEntry:true},'admin')).status,200);
  assert.equal((await req('/api/session','GET',null,'pilot')).data.categoryEntry,true);
  const {event,first,second,enter}=await raceWithTwoStarts(req);
  const placed=await enter(first,'Hypercar');
  await enter(first,'GT3');await enter(second,'Hypercar');
  const crew=await req(`/api/events/${event.id}/departures/${first.id}/crews`,'POST',{name:'Crew',category:'Hypercar',car:''},'admin');
  assert.equal(crew.status,201);
  const listing=(await req('/api/events','GET',null,'admin')).data.events[0].departures[0].crews[0];
  const added=await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:placed.data.id,version:listing.version},'admin');
  assert.equal(added.status,200);
  assert.equal(added.data.removedRegistrations,2);
  assert.deepEqual(await entriesOf(req,event.id),[['Hypercar'],[]]);
});

test('without the module, the other starts keep their entries',async()=>{
  const {req,login}=harness();
  await login(ADMIN,'admin');await login(PILOT,'pilot');
  const {event,first,second,enter}=await raceWithTwoStarts(req);
  const placed=await enter(first,'Hypercar');
  await enter(first,'GT3');await enter(second,'Hypercar');
  const crew=await req(`/api/events/${event.id}/departures/${first.id}/crews`,'POST',{name:'Crew',category:'Hypercar',car:''},'admin');
  const listing=(await req('/api/events','GET',null,'admin')).data.events[0].departures[0].crews[0];
  const added=await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:placed.data.id,version:listing.version},'admin');
  assert.equal(added.data.removedRegistrations,1);
  assert.deepEqual(await entriesOf(req,event.id),[['Hypercar'],['Hypercar']]);
});
