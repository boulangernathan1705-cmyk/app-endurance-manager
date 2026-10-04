import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {linkTestServer, setMember, ORGA_ROLE} from './fixtures/discord-server.mjs';
import {parseLap, crewEstimate} from '../shared/crew-preparation.mjs';

// Crew preparation (migration 0046): the common setup and each pilot's checklist, lap time and consumption.
const ROOT='https://site.example';
const ADMIN='111111111111111111', PILOT='222222222222222222', MATE='333333333333333333';
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();

class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}

const DEV='e0a1c0de-0000-4000-8000-000000000001';
const quietDiscord=async()=>new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
function harness(){
  const DB=new D1();
  linkTestServer(DB.db, DEV);
  const env={DB,APP_ORIGIN:ROOT,COMMUNITY:'commu-dev',DISCORD_CLIENT_ID:'app-id',DISCORD_CLIENT_SECRET:'test-only-secret',ADMIN_DISCORD_IDS:ADMIN,ASSETS:{fetch:async()=>new Response('static')}};
  const jars=new Map();
  async function send(path,method,actor,{json:data,raw,headers:extra={}}={}){
    const jar=jars.get(actor)||{};
    const headers={'CF-Connecting-IP':actor,'Cookie':Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; '),...extra};
    if(method!=='GET'){headers.Origin=ROOT;if(!raw)headers['Content-Type']='application/json';}
    const realFetch=globalThis.fetch;globalThis.fetch=quietDiscord;
    try{return await worker.fetch(new Request(ROOT+path,{method,headers,body:method==='GET'?undefined:raw??JSON.stringify(data||{})}),env);}
    finally{globalThis.fetch=realFetch;}
  }
  async function req(path,method='GET',data,actor='guest'){
    const response=await send(path,method,actor,{json:data});
    return {status:response.status,data:await response.json().catch(()=>null)};
  }
  async function login(discordId,actor,name){
    const start=await worker.fetch(new Request(ROOT+'/api/auth/discord',{headers:{'CF-Connecting-IP':actor}}),env);
    const state=new URL(start.headers.get('Location')).searchParams.get('state');
    const jar={};for(const raw of start.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');jar[pair.slice(0,i)]=pair.slice(i+1);}jars.set(actor,jar);
    const realFetch=globalThis.fetch;
    globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/token')?{access_token:'mock'}:{id:discordId,username:name}),{headers:{'Content-Type':'application/json'}});
    try{
      const callback=await worker.fetch(new Request(`${ROOT}/api/auth/discord/callback?code=test&state=${state}`,{headers:{'CF-Connecting-IP':actor,'Cookie':Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; ')}}),env);
      for(const raw of callback.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');const key=pair.slice(0,i),value=pair.slice(i+1);if(value)jar[key]=value;else delete jar[key];}
    }finally{globalThis.fetch=realFetch;}
    setMember(DB.db,discordId,discordId===ADMIN?[ORGA_ROLE]:[],{communityId:DEV});
  }
  return {DB,req,send,login};
}
const race={name:'6h SPA',circuit:'spa',categories:['GT3'],departures:[{date:'2090-10-15',time:'20:00'}]};
const crewOf=async (req,actor)=>(await req('/api/events','GET',null,actor)).data.events[0].departures[0].crews[0];

async function crewWithTwoPilots(){
  const h=harness();const {req,login}=h;
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');await login('444444444444444444','other','Chloé');
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const base=`/api/events/${event.id}/departures/${event.departures[0].id}`;
  const alice=(await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).data;
  const bob=(await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'mate')).data;
  const crew=(await req(base+'/crews','POST',{name:'Les Tondeuz',category:'GT3'},'pilot')).data;
  const row=await crewOf(req,'pilot');
  assert.equal((await req(`/api/crews/${crew.id}/members`,'POST',{registrationId:bob.id,version:row.version,selfJoin:true},'mate')).status,200);
  return {...h,crew,alice,bob};
}

test('nothing is shown or reachable while the module is off', async () => {
  const {req,crew,alice}=await crewWithTwoPilots();
  assert.equal((await crewOf(req,'pilot')).preparation,undefined);
  assert.equal((await req(`/api/crews/${crew.id}/preparation/${alice.id}`,'PUT',{checks:[]},'pilot')).status,404);
  assert.equal((await req('/api/community/modules','PATCH',{preparation:true},'pilot')).status,403);
  assert.equal((await req('/api/community/modules','PATCH',{preparation:true},'admin')).status,200);
  assert.equal((await req('/api/community/settings','GET',null,'admin')).data.modules.preparation,true);
  assert.deepEqual((await crewOf(req,'pilot')).preparation,{setup:null,pilots:{}});
});

test('each pilot fills in his own preparation, seen by the crew only', async () => {
  const {req,crew,alice,bob}=await crewWithTwoPilots();
  await req('/api/community/modules','PATCH',{preparation:true},'admin');
  const path=`/api/crews/${crew.id}/preparation/`;
  assert.equal((await req(path+alice.id,'PUT',{checks:['stint','setup'],lapMs:137500,fuel:2.854},'pilot')).status,200);
  // Bob cannot write Alice's preparation; wrong values are refused.
  assert.equal((await req(path+alice.id,'PUT',{checks:[]},'mate')).status,403);
  assert.equal((await req(path+bob.id,'PUT',{checks:['nope']},'mate')).status,400);
  assert.equal((await req(path+bob.id,'PUT',{checks:[],lapMs:5},'mate')).status,400);
  assert.equal((await req(path+bob.id,'PUT',{checks:['pit'],fuel:null},'mate')).status,200);
  const prep=(await crewOf(req,'mate')).preparation;
  assert.deepEqual(prep.pilots[alice.id],{checks:['setup','stint'],lapMs:137500,fuel:2.85});
  assert.deepEqual(prep.pilots[bob.id],{checks:['pit'],lapMs:null,fuel:null});
  // Another pilot of the community sees the crew, not its preparation, and cannot read it.
  assert.equal((await crewOf(req,'other')).preparation,undefined);
  assert.equal((await req(path+alice.id,'PUT',{checks:[]},'other')).status,403);
  // The organiser (manage_registrations) sees it.
  assert.ok((await crewOf(req,'admin')).preparation.pilots[alice.id]);
});

test('the crew manager shares a setup of the right kind; the crew downloads it', async () => {
  const {req,send,crew}=await crewWithTwoPilots();
  await req('/api/community/modules','PATCH',{preparation:true},'admin');
  const path=`/api/crews/${crew.id}/setup`;
  const upload=(actor,name,bytes=new Uint8Array([1,2,3]))=>send(path,'PUT',actor,{raw:bytes,headers:{'Content-Type':'application/octet-stream','X-Setup-Name':encodeURIComponent(name)}});
  // Alice created the crew: she manages it. Bob is only a pilot.
  assert.equal((await upload('mate','spa.svm')).status,403);
  assert.equal((await upload('pilot','spa.sto')).status,400);
  assert.equal((await upload('pilot','spa.svm',new Uint8Array(200001))).status,413);
  assert.equal((await upload('pilot','Spa été "rapide".svm')).status,200);
  assert.equal((await crewOf(req,'mate')).preparation.setup.name,'Spa _t_ _rapide_.svm');
  const file=await send(path,'GET','mate');
  assert.equal(file.status,200);assert.deepEqual([...new Uint8Array(await file.arrayBuffer())],[1,2,3]);
  assert.match(file.headers.get('Content-Disposition'),/attachment; filename="Spa _t_ _rapide_.svm"/);
  assert.equal((await send(path,'GET','other')).status,403);
  assert.equal((await req(path,'DELETE',null,'mate')).status,403);
  assert.equal((await req(path,'DELETE',null,'pilot')).status,200);
  assert.equal((await crewOf(req,'pilot')).preparation.setup,null);
});

test('lap times are read as typed, and the crew estimate follows the race length', () => {
  assert.equal(parseLap('1:54.300'),114300);assert.equal(parseLap('1:54,3'),114300);assert.equal(parseLap('114.3'),114300);
  assert.equal(parseLap(''),null);assert.ok(Number.isNaN(parseLap('1:75')));assert.ok(Number.isNaN(parseLap('abc')));
  assert.deepEqual(crewEstimate([{lapMs:120000,fuel:3},{lapMs:124000,fuel:null},{lapMs:null,fuel:null}],360),{lapMs:122000,raceLaps:178,fuel:3,raceFuel:534});
  assert.equal(crewEstimate([{lapMs:null,fuel:2}],360),null);
});
