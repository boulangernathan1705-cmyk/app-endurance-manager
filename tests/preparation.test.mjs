import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {analysePreparation,nextSession} from '../shared/preparation.mjs';
import {validateCapture} from '../server/preparation.mjs';
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
const lap=(number,extra={})=>({number,seconds:120,valid:true,pit:false,continuous:true,wet:false,night:false,fuelUsed:2,...extra});
test('unknown conditions remain unmeasured; optional weather never blocks a routine',()=>{
  const a=analysePreparation([{laps:[lap(1,{wet:null,night:null,pit:null,continuous:null})]}],{wet:true,night:null});
  assert.equal(a.coverage.find(x=>x.key==='wet').status,'unknown');
  assert.equal(a.coverage.find(x=>x.key==='night').status,'unknown');
  assert.equal(a.longestMinutes,0);
  const dry=analysePreparation([],{wet:null,night:false});
  assert.equal(dry.coverage.find(x=>x.key==='wet').status,'optional');
  assert.ok(!dry.coverage.some(x=>x.key==='night'));
  assert.equal(nextSession(dry).key,'familiarity');
});
test('pit laps, pauses and gaps break continuous stints; unknown validity is excluded from pace',()=>{
  const laps=[lap(1),lap(2),lap(3,{pit:true}),lap(4),lap(5,{continuous:false}),lap(6),lap(8),lap(9,{valid:null})];
  const a=analysePreparation([{laps}],{stintMinutes:40});
  assert.equal(a.longestMinutes,4);assert.equal(a.valid,7);assert.equal(a.fuelSamples,5);
});
test('pace groups keep wet and dry practice separate and routines prioritise required missing conditions',()=>{
  const sessions=[{id:'dry',laps:Array.from({length:20},(_,i)=>lap(i+1))},{id:'wet',laps:Array.from({length:10},(_,i)=>lap(i+1,{seconds:180,wet:true}))}];
  const a=analysePreparation(sessions,{night:true,wet:true,stintMinutes:40},'familiar');
  assert.equal(a.paceSeconds,120);assert.equal(a.spreadPercent,0);
  assert.equal(a.coverage.find(x=>x.key==='wet').status,'worked');
  assert.equal(nextSession(a,'familiar').key,'night');
});
test('capture schema rejects duplicate tours, invented boolean flags and invalid dates',()=>{
  const input={clientId:'session-123',game:'lmu',car:'Ferrari',circuit:'spa',startedAt:Date.now(),laps:[lap(1)]};
  assert.equal(validateCapture(input).laps[0].number,1);
  for(const changed of [{laps:[lap(1),lap(1)]},{laps:[lap(1,{wet:'yes'})]},{startedAt:0},{laps:[lap(1,{seconds:Infinity})]}])assert.throws(()=>validateCapture({...input,...changed}));
});
test('preparation is optional, scoped to a crew, and captured data cannot impersonate another pilot',async()=>{
  const {DB,env,req,login}=harness();await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');
  const race={name:'6h SPA',circuit:'spa',categories:['GT3'],departures:[{date:'2090-10-15',time:'20:00'}]};
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'pilot')).data.events[0],base=`/api/events/${event.id}/departures/${event.departures[0].id}`;
  const entry=await req(base+'/registrations','POST',{name:'Alice',category:'GT3',status:'whole'},'pilot');assert.equal(entry.status,201,JSON.stringify(entry.data));
  const created=await req(base+'/crews','POST',{name:'Prépa',category:'GT3',car:'Ferrari 296 LMGT3'},'pilot');assert.equal(created.status,201,JSON.stringify(created.data));const crew=created.data;
  const path=`/api/crews/${crew.id}/preparation`;
  assert.equal((await req(path,'GET',null,'pilot')).status,404);
  assert.equal((await req('/api/community/modules','PATCH',{preparation:true},'admin')).status,200);
  assert.equal((await req(path,'GET',null,'pilot')).status,200);
  assert.equal((await req(path,'GET',null,'mate')).status,403);
  assert.equal((await req(path+'/conditions','PATCH',{wet:true,night:null,stintMinutes:40},'pilot')).status,200);
  assert.equal((await req(path+'/profile','PATCH',{level:'familiar'},'pilot')).status,200);
  const device=(await req(path+'/device','POST',{},'pilot')).data;
  const startedAt=Date.now(),capture={crewId:crew.id,clientId:'test-session',game:'lmu',circuit:'spa',car:'Ferrari 296 LMGT3',startedAt,laps:[lap(1),lap(2)]};
  const ingest=async(payload,key=device.token)=>worker.fetch(new Request(ROOT+'/api/preparation/collector/laps',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload)}),env);
  assert.equal((await ingest({...capture,userId:MATE})).status,200);
  assert.equal((await ingest(capture)).status,200,'retries replace the same tour, never double-count');
  let result=(await req(path,'GET',null,'pilot')).data;
  assert.equal(result.analysis.total,2);assert.equal(result.level,'familiar');
  assert.equal(DB.db.prepare('SELECT user_id FROM preparation_sessions').get().user_id,PILOT);
  assert.equal((await ingest({...capture,car:'Other'})).status,409);
  assert.equal((await ingest({...capture,crewId:'foreign'})).status,404);
  assert.equal((await ingest(capture,'a'.repeat(64))).status,401);
  await req(path+'/device','DELETE',{},'pilot');assert.equal((await ingest(capture)).status,401);
  await req('/api/community/modules','PATCH',{preparation:false},'admin');
  assert.equal((await req(path,'GET',null,'pilot')).status,404);
});

test('endurance guide fits each time budget and warns when a full stint cannot fit',()=>{
  const a=analysePreparation([],{wet:false,night:false,stintMinutes:40},'familiar');
  for(const level of ['discover','familiar'])for(const minutes of [20,30,45,60]){
    const guide=nextSession(a,level,minutes);
    assert.equal(guide.phases.reduce((sum,p)=>sum+p.minutes,0),minutes);
    assert.equal(guide.phases[0].startMinute,0);
    assert.equal(guide.phases.at(-1).endMinute,minutes);
    assert.ok(guide.phases.every(p=>p.minutes>0&&p.actions.length>=2));
    for(let i=1;i<guide.phases.length;i++)assert.equal(guide.phases[i].startMinute,guide.phases[i-1].endMinute);
  }
  assert.equal(nextSession(a,'familiar',30).key,'stint');
  assert.match(nextSession(a,'familiar',30).stintAdvice,/24 min.*40 min.*46 min/);
  assert.equal(nextSession(a,'familiar',60).stintAdvice,null);
  const wet=nextSession(analysePreparation([],{wet:true,night:true}),'familiar',45);
  assert.equal(wet.key,'wet');assert.ok(wet.phases[0].actions.some(x=>x.includes('piste mouillée')));
});

test('relay measurements preserve precision, sample sizes and condition scope',()=>{
  const laps=[120.125,120.625,121.125,121.625,122.125].map((seconds,i)=>lap(i+1,{seconds,energyUsed:4.125}));
  const a=analysePreparation([{clientId:'dry',startedAt:123,laps},{clientId:'wet',laps:[lap(1,{wet:true,seconds:180})]}],{wet:true,night:true});
  assert.equal(a.paceSeconds,121.125);assert.equal(a.bestSeconds,120.125);assert.equal(a.deviationSeconds,.5);
  assert.equal(a.paceSamples,5);assert.deepEqual(a.paceConditions,{wet:false,night:false});assert.equal(a.paceStartedAt,123);
  assert.equal(a.energySamples,5);assert.equal(a.energyPerLap,4.125);assert.equal(a.fuelSamples,5);
  assert.equal(a.longestSeconds,605.625);assert.equal(a.rollingSeconds,785.625);assert.equal(a.wetSeconds,180);
  const unknown=analysePreparation([{laps:[lap(1,{valid:null,wet:null,night:null,pit:null,continuous:null})]}]);
  assert.equal(unknown.validPercent,null);assert.equal(unknown.paceSeconds,null);assert.equal(unknown.deviationSeconds,null);
  assert.equal(unknown.wetKnown,0);assert.equal(unknown.knownValidity,0);
  const split=analysePreparation([{laps:[lap(1)]},{laps:[lap(1,{seconds:180})]}]);
  assert.equal(split.paceSamples,1,'anonymous sessions must not be combined');
});
