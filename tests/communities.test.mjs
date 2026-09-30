import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {syncIracingEvents, importNextCommunity} from '../server/iracing-import.mjs';
import {SEASON} from './fixtures/iracing-season.mjs';
import {linkTestServer, setMember} from './fixtures/discord-server.mjs';

// Separation between communities, with every migration applied in order (as in production) and two
// communities: commu-dev (all the existing data) and commu-test.
const ROOT='https://site.example';
const ADMIN='111111111111111111', PILOT='222222222222222222';
const DEV='e0a1c0de-0000-4000-8000-000000000001', TEST='e0a1c0de-0000-4000-8000-000000000002';
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();

class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');this.applied=new Set();}
  // Applies the migrations not applied yet, up to (excluding) `until`, like D1 does.
  migrate(until=null){for(const file of MIGRATIONS){if(until&&file>=until)break;if(this.applied.has(file))continue;this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));this.applied.add(file);}}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}

function harness(){
  const DB=new D1();DB.migrate();
  DB.db.prepare("INSERT INTO communities(id,slug,name,short_name,created_at) VALUES(?,'commu-test','Commu Test','TEST',0)").run(TEST);
  // Each community has its Discord server; the test players are members of both.
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
  async function login(discordId,actor){
    const start=await worker.fetch(new Request(ROOT+'/api/auth/discord',{headers:{'CF-Connecting-IP':actor}}),env);
    const state=new URL(start.headers.get('Location')).searchParams.get('state');
    const jar={};for(const raw of start.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');jar[pair.slice(0,i)]=pair.slice(i+1);}jars.set(actor,jar);
    const realFetch=globalThis.fetch;
    globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/token')?{access_token:'mock'}:{id:discordId,username:`Pilot ${discordId}`}),{headers:{'Content-Type':'application/json'}});
    try{await req(`/api/auth/discord/callback?code=test&state=${state}`,'GET',null,actor);}finally{globalThis.fetch=realFetch;}
    for(const community of [DEV,TEST])setMember(DB.db,discordId,[],{communityId:community});
  }
  const inCommunity=slug=>{env.COMMUNITY=slug;};
  return {DB,env,req,login,inCommunity};
}
const race={name:'6h SPA',circuit:'spa',categories:['Hypercar'],departures:[{date:'2090-10-15',time:'20:00'}]};

test('migration 0034: existing data goes to commu-dev, community addresses follow the rules', () => {
  const DB=new D1();DB.migrate('0034_communities.sql');
  const db=DB.db;
  db.prepare("INSERT INTO users(id,name,role,created_at) VALUES(?,'Admin','organizer',0)").run(ADMIN);
  db.prepare("INSERT INTO events(id,name,categories,departures,created_by,created_at) VALUES('e1','Race','[\"GT3\"]','[{\"id\":\"d1\",\"date\":\"2090-01-01\",\"time\":\"12:00\",\"startsAt\":3786000000000}]',?,1)").run(ADMIN);
  db.prepare("INSERT INTO participants(id,name,user_id,created_at) VALUES('p1','Admin',?,1)").run(ADMIN);
  db.prepare("INSERT INTO registrations(id,event_id,departure_id,user_id,name,name_key,category,status,created_at,participant_id) VALUES('r1','e1','d1',?,'Admin','admin','GT3','whole',1,'p1')").run(ADMIN);
  db.prepare("INSERT INTO crews(id,event_id,departure_id,name,category,created_at) VALUES('c1','e1','d1','Team','GT3',1)").run();
  db.prepare("INSERT INTO iracing_imports(external_id,event_id,created_at) VALUES('series:x:2090-01-01','e1',1)").run();
  db.prepare("INSERT INTO discord_weekly_state(key) VALUES('lmu-weekly-v1')").run();
  DB.migrate('0040_official_iracing_merge.sql');
  for (const table of ['events','registrations','crews','participants','iracing_imports'])
    assert.deepEqual(db.prepare(`SELECT DISTINCT community_id FROM ${table}`).all().map(row=>row.community_id),[DEV],table);
  // Then the imported iRacing race becomes official (0040), its entries and crews staying in commu-dev.
  DB.migrate();
  assert.deepEqual(db.prepare("SELECT community_id FROM events WHERE id='e1'").get().community_id,'official');
  assert.deepEqual(db.prepare("SELECT community_id FROM registrations WHERE id='r1'").get().community_id,DEV);
  assert.equal(db.prepare('SELECT key FROM discord_weekly_state').get().key,`${DEV}:lmu-weekly-v1`,'the existing Discord message is kept');
  assert.equal(db.prepare("SELECT slug FROM communities").get().slug,'commu-dev');
  const add=slug=>()=>db.prepare("INSERT INTO communities(id,slug,name,short_name,created_at) VALUES(?,?,'X','X',0)").run(crypto.randomUUID(),slug);
  for (const bad of ['www','admin','dev','Majuscule','avec espace','-tiret','tiret-','a','é'] ) assert.throws(add(bad),undefined,bad);
  add('tdz')();add('team-42')();
  assert.throws(()=>db.prepare("UPDATE communities SET slug='autre' WHERE slug='tdz'").run(),/community_slug_fixed/);
});

test('a community never sees, reaches or changes the data of another one', async () => {
  const {req,login,inCommunity}=harness();
  await login(ADMIN,'admin');await login(PILOT,'pilot');
  // commu-dev: a race, an entry and a crew.
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const base=`/api/events/${event.id}/departures/${event.departures[0].id}`;
  const entry=await req(base+'/registrations','POST',{name:'Leo',category:'Hypercar',status:'whole'},'pilot');assert.equal(entry.status,201);
  const crew=await req(base+'/crews','POST',{name:'Team',category:'Hypercar'},'admin');assert.equal(crew.status,201);
  // commu-test sees nothing and reaches nothing by id.
  inCommunity('commu-test');
  assert.equal((await req('/api/events','GET',null,'admin')).data.events.length,0);
  assert.equal((await req(`/api/events/${event.id}`,'PATCH',{...race,version:event.version},'admin')).status,404);
  assert.equal((await req(`/api/events/${event.id}`,'DELETE',{version:event.version},'admin')).status,404);
  assert.equal((await req(base+'/registrations','POST',{name:'Leo',category:'Hypercar',status:'whole'},'pilot')).status,404);
  assert.equal((await req(base+'/crews','POST',{name:'Intruder',category:'Hypercar'},'admin')).status,404);
  assert.equal((await req(`/api/crews/${crew.data.id}`,'DELETE',{version:1},'admin')).status,404);
  assert.equal((await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:entry.data.id,version:1},'admin')).status,404);
  assert.equal((await req(`/api/registrations/${entry.data.id}`,'DELETE',{version:1},'pilot')).status,404);
  assert.equal((await req(`/api/registrations/${entry.data.id}/departure`,'PATCH',{departureId:event.departures[0].id,version:1},'pilot')).status,404);
  assert.ok((await req('/api/participants','GET',null,'admin')).data.participants.every(item=>item.participantId===null),'no pilot entry of commu-dev');
  assert.equal((await req('/api/events','GET',null,'guest')).status,401,'not signed in: nothing');
  // Its own race stays its own.
  assert.equal((await req('/api/events','POST',{...race,name:'4h FUJI',circuit:'fuji'},'admin')).status,201);
  assert.deepEqual((await req('/api/events','GET',null,'admin')).data.events.map(item=>item.name),['4h FUJI']);
  inCommunity('commu-dev');
  assert.deepEqual((await req('/api/events','GET',null,'admin')).data.events.map(item=>item.name),['6h SPA']);
  assert.equal((await req('/api/events','GET',null,'admin')).data.events[0].departures[0].availability.length,1,'commu-dev data untouched');
});

test('the database itself refuses mixing communities or moving data between them', async () => {
  const {DB,req,login}=harness();
  await login(ADMIN,'admin');await login(PILOT,'pilot');
  await req('/api/events','POST',race,'admin');
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const base=`/api/events/${event.id}/departures/${event.departures[0].id}`;
  const entry=await req(base+'/registrations','POST',{name:'Leo',category:'Hypercar',status:'whole'},'pilot');
  const db=DB.db, participant=db.prepare('SELECT participant_id FROM registrations WHERE id=?').get(entry.data.id).participant_id;
  assert.throws(()=>db.prepare(`INSERT INTO registrations(id,event_id,departure_id,name,name_key,category,status,created_at,participant_id,community_id) VALUES('x',?,?,'X','x','Hypercar','whole',1,?,?)`).run(event.id,event.departures[0].id,participant,TEST),/community_mismatch/);
  assert.throws(()=>db.prepare(`INSERT INTO crews(id,event_id,departure_id,name,category,created_at,community_id) VALUES('x',?,?,'X','Hypercar',1,?)`).run(event.id,event.departures[0].id,TEST),/community_mismatch/);
  assert.throws(()=>db.prepare(`INSERT INTO events(id,name,categories,departures,created_by,created_at) VALUES('y','Y','["GT3"]','[]',?,1)`).run(ADMIN),/community_invalid/,'a race without community is refused');
  for (const table of ['events','registrations','participants'])
    assert.throws(()=>db.prepare(`UPDATE ${table} SET community_id=?`).run(TEST),/community_fixed/,table);
  db.prepare(`INSERT INTO events(id,name,categories,departures,created_by,created_at,community_id) VALUES('other','Other','["Hypercar"]',?,?,1,?)`).run(JSON.stringify([{id:'od',date:'2090-10-15',time:'20:00',startsAt:3811953600000}]),ADMIN,TEST);
  db.prepare(`INSERT INTO crews(id,event_id,departure_id,name,category,created_at,community_id) VALUES('oc','other','od','Other','Hypercar',1,?)`).run(TEST);
  assert.throws(()=>db.prepare("INSERT INTO crew_members(registration_id,crew_id) VALUES(?, 'oc')").run(entry.data.id),/community_mismatch|crew_membership_invalid/);
});

test('official iRacing races are imported once, common to the communities that show the iRacing calendar', async () => {
  const {DB,env}=harness();
  DB.db.prepare("UPDATE communities SET modules='{\"iracingImport\":true}' WHERE id=?").run(TEST);
  const future=JSON.parse(JSON.stringify(SEASON).replaceAll('2026-','2099-'));
  const fetchImpl=async url=>new Response(JSON.stringify(String(url).includes('wp-json')?[]:String(url).endsWith('manifest.json')?{current:'2099S4'}:future));
  const first=await syncIracingEvents(env,{fetchImpl});
  const count=id=>DB.db.prepare('SELECT COUNT(*) n FROM events WHERE community_id=?').get(id).n;
  assert.ok(count('official')>0);assert.equal(first.created,count('official'));
  assert.equal(count(DEV)+count(TEST),0,'no copy per community');
  assert.equal((await syncIracingEvents(env,{fetchImpl})).created,0,'imported once');
});

// Calls to the database the way D1 counts them (a batch is one call): a run may make 50.
function countCalls(DB){
  const counter={calls:0};let inBatch=false;const batch=DB.batch.bind(DB),prepare=DB.prepare.bind(DB);
  DB.batch=async statements=>{counter.calls++;inBatch=true;try{return await batch(statements);}finally{inBatch=false;}};
  DB.prepare=sql=>{const statement=prepare(sql);for(const name of ['run','first','all']){const call=statement[name].bind(statement);statement[name]=(...args)=>{if(!inBatch)counter.calls++;return call(...args);};}return statement;};
  return counter;
}

test('the scheduled iRacing import makes the official races once, within the database budget', async () => {
  const {DB,env}=harness();
  DB.db.prepare("UPDATE communities SET modules='{\"iracingImport\":true}' WHERE id=?").run(TEST);
  const future=JSON.parse(JSON.stringify(SEASON).replaceAll('2026-','2099-'));
  const fetchImpl=async url=>new Response(JSON.stringify(String(url).includes('wp-json')?[]:String(url).endsWith('manifest.json')?{current:'2099S4'}:future));
  const count=id=>DB.db.prepare('SELECT COUNT(*) n FROM events WHERE community_id=?').get(id).n;
  const counter=countCalls(DB);
  const first=await importNextCommunity(env,new Date('2099-01-05T10:15:00Z'),{fetchImpl});
  assert.ok(first.created>0);
  assert.ok(counter.calls<=20,`${counter.calls} calls to the database for ${first.created} races`);
  assert.equal(count('official'),first.created);
  assert.equal((await importNextCommunity(env,new Date('2099-01-05T11:15:00Z'),{fetchImpl})).created,0,'nothing twice');
});

test('official races: every community enters them; a player sees the entries of all his communities, never of the others', async () => {
  const {DB,req,login,inCommunity}=harness();
  const OUT='333333333333333333';
  await login(ADMIN,'admin');await login(PILOT,'pilot');await login(OUT,'out');
  DB.db.prepare("UPDATE memberships SET status='left' WHERE user_id=? AND community_id=?").run(OUT,TEST);
  // Only the platform managers make an official race.
  assert.equal((await req('/api/events','POST',{...race,official:true},'pilot')).status,403);
  assert.equal((await req('/api/events','POST',{...race,official:true,name:'6h Officielle'},'admin')).status,201);
  const official=(await req('/api/events','GET',null,'pilot')).data.events.find(event=>event.name==='6h Officielle');
  assert.equal(official.official,true);
  const base=`/api/events/${official.id}/departures/${official.departures[0].id}`;
  assert.equal((await req(base+'/registrations','POST',{name:'Leo',category:'Hypercar',status:'whole'},'pilot')).status,201,'an entry of commu-dev');
  inCommunity('commu-test');
  const twice=await req(base+'/registrations','POST',{name:'Leo',category:'Hypercar',status:'whole'},'pilot');
  assert.equal(twice.status,409,'one Discord account enters a start once');assert.match(twice.data.error,/autre de tes communautés/);
  assert.equal((await req(base+'/registrations','POST',{name:'Leo',category:'Hypercar',status:'whole',forOther:true},'admin')).status,201,'another pilot named Leo, in commu-test');
  assert.equal((await req(base+'/crews','POST',{name:'Test Team',category:'Hypercar'},'admin')).status,201);
  // On commu-test: its own entry and crew, and the pilot's entry of commu-dev, marked with its community.
  let departure=(await req('/api/events','GET',null,'pilot')).data.events.find(event=>event.id===official.id).departures[0];
  assert.equal(departure.availability.length,2);
  const foreign=departure.availability.find(reg=>reg.foreign);
  assert.equal(foreign.community.name,'Commu Dev');assert.equal(foreign.canEdit,true,'his own entry, with his rights in commu-dev');
  assert.equal(departure.availability.find(reg=>!reg.foreign).community.shortName.length>0,true,'every entry of an official race shows its community');
  assert.equal(departure.crews.length,1);assert.ok(!departure.crews[0].foreign);
  // A player of commu-dev only: commu-dev's entry, never the entry or the crew of commu-test.
  inCommunity('commu-dev');
  departure=(await req('/api/events','GET',null,'out')).data.events.find(event=>event.id===official.id).departures[0];
  assert.equal(departure.availability.length,1);assert.ok(!departure.availability[0].foreign);
  assert.equal(departure.crews.length,0);
  // An official race is changed by the managers only; « Rendre officielle » too.
  assert.equal((await req('/api/events/'+official.id,'DELETE',{version:official.version},'pilot')).status,403);
  const own=await req('/api/events','POST',{...race,name:'Privée'},'admin');
  assert.equal((await req(`/api/events/${own.data.id}/official`,'POST',{},'pilot')).status,403);
  assert.equal((await req(`/api/events/${own.data.id}/official`,'POST',{},'admin')).status,200);
  assert.equal(DB.db.prepare('SELECT community_id FROM events WHERE id=?').get(own.data.id).community_id,'official');
});
