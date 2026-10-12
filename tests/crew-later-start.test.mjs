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
  '0015_crew_lock.sql','0016_crew_ownership.sql','0016_client_errors.sql','0017_discord_weekly.sql','0026_event_schedule_pending.sql','0027_solo_races.sql','0028_solo_round_choices.sql','0029_event_duration_minutes.sql','0030_iracing_import.sql','0031_solo_driver.sql','0054_event_sim.sql','0055_event_absences.sql','0032_tbd_imported_specials.sql','0033_lmu_pending_common_start.sql','0034_communities.sql','0035_memberships.sql','0036_commu_dev_discord.sql','0057_event_last_start.sql','0058_event_last_start_undated.sql','0059_grindfest.sql','0063_registration_comment.sql','0065_crew_start_later.sql'
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

// « Départ à choisir »: a crew created without a start; pilots join it from the start of their choice, then its
// leader fixes the start and keeps the pilots entered there.
test('a crew created without a start is joined from any start, then fixed on one', async()=>{
  const {DB,req,login}=harness();
  await login(ADMIN,'admin');await login(PILOT,'pilot');await login(TEAMMATE,'teammate');
  const eventInput={name:'Portimão',categories:['LMP2 ELMS','GT3'],departures:[{date:'2090-10-15',time:'14:00'},{date:'2090-10-16',time:'19:00'}]};
  assert.equal((await req('/api/events','POST',eventInput,'admin')).status,201);
  let event=(await req('/api/events','GET',null,'pilot')).data.events[0];
  const [first,second]=event.departures;
  DB.db.prepare('INSERT INTO community_role_permissions(community_id,discord_role_id,permissions,updated_at) VALUES(?,?,?,0)').run(DEV_COMMUNITY,CREW_ROLE,JSON.stringify(['crews']));
  setMember(DB.db,PILOT,[CREW_ROLE]);
  // The team manager is entered nowhere: the crew starts empty, without a start, and he leads it.
  assert.equal((await req(`/api/events/${event.id}/departures/${first.id}/crews`,'POST',{name:'LMP2',category:'LMP2 ELMS',later:true},'teammate')).status,403);
  const created=await req(`/api/events/${event.id}/departures/${first.id}/crews`,'POST',{name:'LMP2',category:'LMP2 ELMS',later:true},'pilot');
  assert.equal(created.status,201);assert.equal(created.data.joined,false);
  event=(await req('/api/events','GET',null,'teammate')).data.events[0];
  assert.equal(event.departures.every(d=>d.crews.length===0),true);
  let crew=event.laterCrews[0];
  assert.equal(crew.later,true);assert.equal(crew.canManage,false);
  // Each pilot joins from the start of his choice.
  const a=await req(`/api/events/${event.id}/departures/${first.id}/registrations`,'POST',{name:'Mate',category:'LMP2 ELMS',status:'whole'},'teammate');
  const b=await req(`/api/events/${event.id}/departures/${second.id}/registrations`,'POST',{name:'Mate',category:'LMP2 ELMS',status:'h1,h2'},'teammate');
  assert.equal((await req(`/api/crews/${crew.id}/members`,'POST',{registrationId:a.data.id,version:crew.version,selfJoin:true},'teammate')).status,200);
  assert.equal((await req(`/api/crews/${crew.id}/members`,'POST',{registrationId:b.data.id,version:crew.version+1,selfJoin:true},'teammate')).status,200);
  const c=await req(`/api/events/${event.id}/departures/${second.id}/registrations`,'POST',{name:'Owner',category:'LMP2 ELMS',status:'whole'},'pilot');
  assert.equal((await req(`/api/crews/${crew.id}/members`,'POST',{registrationId:c.data.id,version:crew.version+2,selfJoin:true},'pilot')).status,200);
  crew=(await req('/api/events','GET',null,'pilot')).data.events[0].laterCrews[0];
  assert.equal(crew.registrationIds.length,3);assert.equal(crew.canManage,true);
  // Only its leader (or « crews ») fixes the start; the pilots entered elsewhere leave it, their entries stay.
  assert.equal((await req(`/api/crews/${crew.id}`,'PATCH',{departureId:second.id,version:crew.version},'teammate')).status,403);
  const fixed=await req(`/api/crews/${crew.id}`,'PATCH',{departureId:second.id,version:crew.version},'pilot');
  assert.equal(fixed.status,200);assert.equal(fixed.data.left,1);
  event=(await req('/api/events','GET',null,'pilot')).data.events[0];
  assert.equal(event.laterCrews.length,0);
  assert.deepEqual(event.departures[1].crews[0].registrationIds.sort(),[b.data.id,c.data.id].sort());
  assert.equal(event.departures[0].availability.length,1,'the entry on the other start is kept');
});
