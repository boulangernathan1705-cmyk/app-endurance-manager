import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {refreshLaptimes, crewPreparation,refreshMemoPilot,saveLive} from '../server/training.mjs';
import {collectMemo,collectiveMemo,restartMemo,MEMO_PERIOD} from '../server/memo-collection.mjs';
import {BOP} from '../shared/lmu-bop.mjs';
import {bopFor} from '../shared/bop.mjs';
import {linkTestServer, setMember, ORGA_ROLE} from './fixtures/discord-server.mjs';
import {parseResults, analyse, programSteps, adviceFor, todaySession, circuitOf, cleanLive, analyseLive, stopTime,refuelAmounts,memoPilots, memoSheet, parseLaptimes, levelOf, levelBands} from '../shared/training.mjs';

// Individual training (migration 0046): LMU results files, the program, the advice and the sync program.
const ROOT='https://site.example';
const ADMIN='111111111111111111', PILOT='222222222222222222', MATE='333333333333333333';
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();

class D1 {
  constructor(){this.reads=[];this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){const results=self.db.prepare(sql).all(...this.params);self.reads.push({sql,params:this.params,rows:results.length,bytes:Buffer.byteLength(JSON.stringify(results))});return {results};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}

const DEV='e0a1c0de-0000-4000-8000-000000000001';
const quietDiscord=async()=>new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
function harness(){
  const DB=new D1();
  linkTestServer(DB.db, DEV);
  const env={DB,APP_ORIGIN:ROOT,COMMUNITY:'commu-dev',DISCORD_CLIENT_ID:'app-id',DISCORD_CLIENT_SECRET:'test-only-secret',ADMIN_DISCORD_IDS:ADMIN,ASSETS:{fetch:async request=>new URL(request.url).pathname==='/downloads/EnduranceManagerSync.exe'?new Response(new Uint8Array(4096).fill(77)):new Response('static')}};
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
  return {DB,req,send,login,env};
}
const XML=readFileSync(new URL('./fixtures/lmu-results-practice.xml',import.meta.url),'utf8');
// A real online practice (names replaced): every driver is marked isPlayer, and one car was shared.
const ONLINE=readFileSync(new URL('./fixtures/lmu-results-online-barcelona.xml',import.meta.url),'utf8');
// The same session another day, by another pilot: only the date and the lap times change.
const variant=(xml,day,shift)=>xml.replace(/<DateTime>\d+<\/DateTime>/g,`<DateTime>${1790000000+day*86400}</DateTime>`).replace(/>(1\d\d\.\d{4})<\/Lap>/g,(_,t)=>`>${(Number(t)+shift).toFixed(4)}</Lap>`);
const upload=(send,actor,xml)=>send('/api/training/sessions','POST',actor,{raw:xml,headers:{'Content-Type':'application/xml'}});

test('a results file gives the player laps, fuel and sectors, and a program from them', () => {
  const session=parseResults(XML);
  assert.deepEqual([session.venue,session.car,session.carClass,session.kind,session.laps.length],['Circuit de Spa-Francorchamps','Alpine A424','Hypercar','Practice1',25]);
  assert.equal(session.at,1790000000000);
  const {n,t,s,pit,fuel,ve}=session.laps[13];
  assert.deepEqual({n,t,s,pit,fuel,ve},{n:14,t:152.4,s:[41.148,51.816,59.436],pit:true,fuel:null,ve:null});
  assert.equal(session.laps[14].t,null);assert.equal(session.laps[12].fuel,3.6);
  assert.throws(()=>parseResults('<html></html>'),/fichier de résultats LMU/);
  assert.throws(()=>parseResults(XML.replace('<isPlayer>1</isPlayer>','<isPlayer>0</isPlayer>')),/Ton pilote/);
  assert.equal(circuitOf(session.venue),'spa');assert.equal(circuitOf('Circuit de la Sarthe'),'le-mans');
  const a=analyse([session]);
  assert.deepEqual([a.totalLaps,a.longestRun,a.pitDone,a.fuelPerLap,a.tankLaps],[24,10,true,3.6,27]);
  const steps=programSteps(a,['simulation']);
  assert.deepEqual(steps.map(step=>step.done),[true,true,false,true,true]);
  assert.equal(steps[4].proof,'Coché par toi');
  // The first step left (a full tank) shapes today's session; the eve of the race is always short.
  assert.equal(todaySession(a,steps,{minutes:60}).blocks[0].laps,27);
  assert.equal(todaySession(a,steps,{minutes:30,daysLeft:1}).focus,'Veille de course');
  assert.match(adviceFor(a)[0].title,/Secteur 3/);
  assert.equal(adviceFor(analyse([]))[0].key,'none');
});

test('the pilot drops his files, sees his program, and compares with the pilots of the site without names', async () => {
  const {req,send,login}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');await login('444444444444444444','other','Chloé');
  assert.equal((await req('/api/training','GET',null,'pilot')).status,404);
  assert.equal((await req('/api/community/modules','PATCH',{training:true},'admin')).status,200);
  // Not entered in any race: the memo shows in the bar, the training does not.
  const session=(await req('/api/session','GET',null,'pilot')).data;
  assert.equal(session.training,true);assert.equal(session.trainingRace,false);
  let data=(await req('/api/training','GET',null,'pilot')).data;
  assert.equal(data.track,null);assert.equal(data.steps[0].done,false);assert.equal(data.device.linked,false);
  let response=await upload(send,'pilot',XML);
  assert.equal(response.status,200);assert.equal((await response.json()).created,true);
  assert.equal((await (await upload(send,'pilot',XML)).json()).created,false);
  assert.equal((await upload(send,'pilot','pas un fichier')).status,400);
  data=(await req('/api/training','GET',null,'pilot')).data;
  assert.equal(data.track.circuit,'spa');assert.equal(data.carClass,'Hypercar');assert.equal(data.analysis.totalLaps,24);
  assert.deepEqual(data.steps.map(step=>step.done),[true,true,false,true,false]);
  assert.deepEqual(data.comparison,{pilots:1});
  // Two other pilots, one faster and one slower: Alice is second of three, never told who the others are.
  await upload(send,'mate',variant(XML,1,-1));await upload(send,'other',variant(XML,2,2));
  data=(await req('/api/training','GET',null,'pilot')).data;
  assert.equal(data.comparison.pilots,3);assert.equal(data.comparison.rank,2);assert.equal(data.comparison.faster,50);
  assert.ok(Math.abs(data.comparison.gap-1)<0.001);
  assert.ok(!JSON.stringify(data.comparison).includes('Bob'));
  // A step the file cannot tell is ticked by the pilot.
  assert.equal((await req('/api/training/marks','PUT',{track:data.track.key,step:'simulation',done:true},'pilot')).status,200);
  assert.equal((await req('/api/training/marks','PUT',{track:data.track.key,step:'nope',done:true},'pilot')).status,400);
  assert.equal((await req('/api/training','GET',null,'pilot')).data.steps[4].done,true);
  // Removing a session removes it for Alice only.
  assert.equal((await req(`/api/training/sessions/${data.sessions[0].id}`,'DELETE',null,'mate')).status,200);
  assert.equal((await req('/api/training','GET',null,'pilot')).data.sessions.length,1);
  assert.equal((await req(`/api/training/sessions/${data.sessions[0].id}`,'DELETE',null,'pilot')).status,200);
  assert.equal((await req('/api/training','GET',null,'pilot')).data.sessions.length,0);
});

test('named preparation is only returned to members of the same crew and community', async () => {
  const {req,send,login,env}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');
  await req('/api/community/modules','PATCH',{training:true},'admin');
  const created=await req('/api/events','POST',{name:'Spa preparation',circuit:'spa',categories:['Hypercar'],departures:[{date:'2090-10-15',time:'15:00'}]},'admin');
  assert.equal(created.status,201);
  const event=(await req('/api/events','GET',null,'pilot')).data.events[0], dep=event.departures[0];
  const base=`/api/events/${event.id}/departures/${dep.id}`;
  assert.equal((await req(base+'/registrations','POST',{name:'Alice',category:'Hypercar',status:'whole'},'pilot')).status,201);
  const crew=await req(base+'/crews','POST',{name:'Spa crew',category:'Hypercar',car:'Alpine A424'},'pilot');
  assert.equal(crew.status,201);
  const mate=await req(base+'/registrations','POST',{name:'Bob',category:'Hypercar',status:'whole'},'mate');
  assert.equal(mate.status,201);
  await upload(send,'pilot',XML);await upload(send,'mate',variant(XML,1,-1));
  // Being registered on the same departure does not reveal another crew's pilot data.
  let data=(await req('/api/training','GET',null,'mate')).data;
  assert.equal(data.crew,null);
  let listing=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:mate.data.id,version:listing.version,selfJoin:true},'mate')).status,200);
  data=(await req('/api/training','GET',null,'pilot')).data;
  assert.deepEqual(data.crew.pilots.map(p=>p.name),['Alice','Bob']);
  assert.equal(data.crew.pilots[0].you,true);assert.ok(data.crew.pilots[1].pace>0);
  assert.equal((await crewPreparation(env,PILOT,'another-community',data.race,data.track,data.carClass)).crew,null);
  assert.equal((await crewPreparation(env,PILOT,DEV,data.race,{...data.track,circuit:'long-beach'},data.carClass)).crew,null);
  listing=(await req('/api/events','GET',null,'mate')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}/members/${mate.data.id}`,'DELETE',{version:listing.version},'mate')).status,200);
  assert.equal((await req('/api/training','GET',null,'mate')).data.crew,null);
});

test('the sync program carries the pilot key, sends sessions with it only, and stops once the link is removed', async () => {
  const {req,send,login}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  await req('/api/community/modules','PATCH',{training:true},'admin');
  const program=await send('/api/training/sync','POST','pilot',{raw:''});
  assert.equal(program.status,200);assert.match(program.headers.get('Content-Disposition'),/EnduranceManagerSync\.exe/);
  const bytes=new Uint8Array(await program.arrayBuffer());
  const trailer=new TextDecoder().decode(bytes.slice(4096));
  const [,origin,key]=trailer.match(/EMSYNC1 (\S+) ([a-f0-9]{64}) EMSYNC1/);
  assert.equal(origin,ROOT);
  const collect=(xml,auth)=>send('/api/training/collector','POST','sync',{raw:xml,headers:{'Content-Type':'application/xml',Authorization:auth}});
  assert.equal((await collect(XML,'Bearer '+'0'.repeat(64))).status,401);
  assert.equal((await collect(XML,'Bearer '+key)).status,200);
  const data=(await req('/api/training','GET',null,'pilot')).data;
  assert.equal(data.sessions.length,1);assert.equal(data.device.linked,true);assert.ok(data.device.lastSeen);
  assert.equal((await req('/api/training/sync','DELETE',null,'pilot')).status,200);
  assert.equal((await collect(XML,'Bearer '+key)).status,401);
});

// What connectors/lmu-sync/live.go sends after a session: laps with tyres and litres, and the stops broken down.
const liveLap=(n,extra={})=>({n,t:137+n/10,top:300+n,fuel:2.9,ve:3.4,wear:[1.2,1.1,1.6,1.5],temp:[88,87,92,91],brake:[520,515,480,470],kpa:[150,150,148,148],compound:'Medium',track:31,air:22,rain:0,...extra});
const LIVE={at:1790000100000,track:'Circuit de Spa-Francorchamps',car:'Alpine A424',class:'Hypercar',session:1,capacity:90,
  laps:[liveLap(1),liveLap(2),liveLap(3,{pit:true,fuel:0,ve:0}),liveLap(4,{compound:'Soft',wear:[2,2,2.4,2.4],temp:[95,94,99,98]}),liveLap(5,{invalid:true,fuel:9})],
  stops:[{lap:3,lane:52.4,stopped:24.1,fuel:40,ve:48,tyres:4},{lap:9,lane:40,stopped:12,fuel:36,ve:0,tyres:0},{lap:14,lane:38,stopped:9,fuel:0,ve:0,tyres:4}]};

test('live data gives litres, the fuel ratio, tyres by compound and the stops broken down', async () => {
  const live=cleanLive(LIVE);
  assert.equal(live.laps.length,5);
  assert.throws(()=>cleanLive({laps:[],stops:[]}),/incomplète|illisible/);
  assert.equal(cleanLive({...LIVE,laps:[{...liveLap(1),top:'<script>',wear:[1,2]}]}).laps[0].top,null);
  // A lap LMU counted without a time keeps its fuel; one with nothing in it is dropped.
  const untimed=cleanLive({...LIVE,laps:[liveLap(1),liveLap(2,{t:0}),liveLap(3,{t:0,fuel:0,ve:0,wear:[0,0,0,0]})]}).laps;
  assert.deepEqual(untimed.map(lap=>[lap.n,lap.t,lap.fuel]),[[1,LIVE.laps[0].t,LIVE.laps[0].fuel],[2,null,LIVE.laps[1].fuel]]);
  const a=analyseLive([live]);
  assert.deepEqual([a.fuelPerLap,a.energyPerLap,a.capacity,a.tankLaps,a.energyLaps,a.top],[2.9,3.4,90,31,29,305]);
  // 2,9 l of 90 l is 3,22 % of the tank, against 3,4 % of energy: ratio 0,95.
  assert.equal(a.ratio,0.95);
  assert.deepEqual(a.compounds.map(item=>[item.name,item.laps,item.wear[2],item.temp[2]]),[['Medium',2,1.6,92],['Soft',1,2.4,99]]);
  assert.equal(a.compounds[0].lapsTo50,31);
  assert.deepEqual([a.pit.stops,a.pit.through,a.pit.tyres4,a.pit.fuelRate],[3,28.3,9,3]);

  const {req,send,login}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  await req('/api/community/modules','PATCH',{training:true},'admin');
  const program=await send('/api/training/sync','POST','pilot',{raw:''});
  const key=new TextDecoder().decode(new Uint8Array(await program.arrayBuffer()).slice(4096)).match(/([a-f0-9]{64})/)[1];
  const push=(body,auth='Bearer '+key)=>send('/api/training/live','POST','sync',{raw:body,headers:{'Content-Type':'application/json',Authorization:auth}});
  assert.equal((await push(JSON.stringify(LIVE),'Bearer '+'0'.repeat(64))).status,401);
  assert.equal((await push('{oops')).status,400);
  let response=await push(JSON.stringify(LIVE));
  assert.equal(response.status,200);assert.equal((await response.json()).created,true);
  assert.equal((await (await push(JSON.stringify(LIVE))).json()).created,false);
  await send('/api/training/collector','POST','sync',{raw:XML,headers:{'Content-Type':'application/xml',Authorization:'Bearer '+key}});
  const data=(await req('/api/training','GET',null,'pilot')).data;
  assert.equal(data.live.ratio,0.95);assert.equal(data.live.pit.stops,3);
  // The results file's 3,6 % of the tank, in litres now that the game told the tank size.
  assert.equal(data.analysis.fuelLitres,3.24);
});

// The Ferrari 296 GT3's service times, read in LMU's API and checked on three real stops at Long Beach (5 October).
const SERVICE_296={fuelRate:3.4,energyRate:2.5,connect:2,tyres4:12,tyres2:4.5,wing:25,ductFront:10,ductRear:9,brakes:120,driver:25,repair:30};

test('refuel estimates use the difference between current and target energy at one-percent precision',()=>{
  const a=refuelAmounts(20,73,1,90);
  assert.equal(a.energy,53);assert.ok(Math.abs(a.fuel-47.7)<0.00001);
  assert.equal(stopTime(SERVICE_296,{...a}),21.2);
  assert.equal(refuelAmounts(20,74,1,90).energy,54);
  assert.deepEqual(refuelAmounts(70,70,1,90),{energy:0,fuel:0});
  assert.deepEqual(refuelAmounts(80,60,1,90),{energy:0,fuel:0});
  assert.deepEqual(refuelAmounts(0,100,null,90),{energy:100,fuel:null});
});

test('history is metadata, individual analysis is bounded, and memo reads summaries instead of all pilots laps',async()=>{
  const {req,send,login,DB,env}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  await req('/api/community/modules','PATCH',{training:true},'admin');
  for(let i=0;i<25;i++) {
    const xml=XML.replace(/<DateTime>\d+<\/DateTime>/,`<DateTime>${Math.floor(Date.now()/1000)-i*3600}</DateTime>`);
    assert.equal((await upload(send,'pilot',xml)).status,200);
  }
  DB.reads=[];
  const data=(await req('/api/training','GET',null,'pilot')).data;
  assert.equal(data.sessions.length,20);assert.equal(data.analysis.sessions,5);assert.equal(data.analysisWindow,5);
  const history=DB.reads.find(read=>read.sql.includes('lap_count,best FROM training_sessions'));
  const detail=DB.reads.find(read=>read.sql.includes('SELECT started_at,car,kind,laps FROM training_sessions'));
  assert.equal(detail.rows,5);assert.equal(detail.params.at(-1),5);assert.ok(history.bytes<detail.bytes,'history omits lap arrays');
  assert.ok(data.sessions.every(session=>session.laps===25));
  // Seed an old imported live history: summaries are refreshed using just the last five sessions.
  const user=DB.db.prepare('SELECT id FROM users WHERE name=?').get('Alice').id;
  const live=cleanLive(LIVE),laps=JSON.stringify(live.laps),stops=JSON.stringify(live.stops);
  for(let i=0;i<25;i++) DB.db.prepare(`INSERT INTO training_live(id,user_id,fingerprint,started_at,circuit,track,car,car_class,capacity,laps,stops,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run('live-'+i,user,'live-'+i,Date.now()-i*3600000,'spa','Spa','Alpine A424','Hypercar',90,laps,stops,Math.floor(Date.now()/1000));
  DB.reads=[];await refreshMemoPilot(env,user,'spa','Alpine A424');
  assert.equal(DB.reads.find(read=>read.sql.includes('capacity,laps,stops,game FROM training_live')).rows,5);
  DB.reads=[];
  assert.equal((await req('/api/training/memo?circuit=spa','GET',null,'pilot')).status,200);
  assert.ok(!DB.reads.some(read=>read.sql.includes(' FROM training_live')&&/SELECT[^;]*\blaps\b/.test(read.sql)),'shared memo reads no raw lap arrays');
  const rows=DB.db.prepare('SELECT capacity,laps FROM training_live ORDER BY started_at DESC LIMIT 5').all().map(row=>({user,capacity:row.capacity,laps:JSON.parse(row.laps)}));
  const summary=JSON.parse(DB.db.prepare('SELECT summary FROM training_memo_pilots WHERE user_id=?').get(user).summary);
  const rawSheet=memoSheet({sessions:rows,viewer:user}),cachedSheet=memoSheet({summaries:[summary],viewer:user});
  for(const field of ['fuel','energy','tyres','levels','stint']) assert.deepEqual(cachedSheet[field],rawSheet[field]);
  // Existing imports are warmed in small batches, never a full historical scan of lap data.
  DB.db.prepare('DELETE FROM training_memo_pilots').run();DB.reads=[];
  assert.equal((await req('/api/training/memo?circuit=spa','GET',null,'pilot')).status,200);
  assert.equal(DB.reads.filter(read=>read.sql.includes('capacity,laps,stops,game FROM training_live')).length,1);
});

test('memo freezes at five contributors and 100 usable laps, remains public to non-contributors and keeps personal figures fresh',async()=>{
  const {req,login,env,DB}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');
  for(let i=4;i<=6;i++)await login(String(i).repeat(18),'p'+i,'Pilot '+i);
  await req('/api/community/modules','PATCH',{training:true},'admin');
  const names=['Alice','Bob','Pilot 4','Pilot 5','Pilot 6'];
  const users=names.map(name=>DB.db.prepare('SELECT id FROM users WHERE name=?').get(name).id);
  const at=Date.now()-1000,entry={circuit:'spa',car:'Alpine A424',track:'Spa',car_class:'Hypercar'};
  const session=(fuel,count,time=at)=>cleanLive({...LIVE,at:time,laps:Array.from({length:count},(_,i)=>liveLap(i+1,{fuel,ve:fuel})),stops:[]});
  for(let i=0;i<4;i++)await collectMemo(env,users[i],session(i+1,25),'s'+i,'spa',at);
  let result=await collectiveMemo(env,entry,at);
  assert.equal(result.collection.state,'collecting');assert.equal(result.collection.laps,100);
  await collectMemo(env,users[4],session(5,1),'s4','spa',at);
  result=await collectiveMemo(env,entry,at);
  assert.equal(result.collection.state,'stable');assert.equal(result.collection.pilots,5);assert.equal(result.collection.laps,101);
  assert.equal(result.sheet.fuel.median,3,'each pilot has equal weight, regardless of lap count');
  const frozen=JSON.stringify(result.sheet);
  await collectMemo(env,users[0],session(9,100),'after-freeze','spa',at);
  assert.equal(JSON.stringify((await collectiveMemo(env,entry,at)).sheet),frozen);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS n FROM training_memo_contributions').get().n,5);
  const publicMemo=(await req('/api/training/memo?circuit=spa','GET',null,'admin')).data;
  assert.equal(publicMemo.fuel.median,3);assert.equal(publicMemo.fuel.you,null);assert.equal(publicMemo.canRestart,true);
  await saveLive(env,users[0],JSON.stringify({...LIVE,at:Date.now()+1000,laps:[liveLap(1,{fuel:8,ve:8})],stops:[]}));
  const personalMemo=(await req('/api/training/memo?circuit=spa','GET',null,'pilot')).data;
  assert.equal(personalMemo.fuel.median,3);assert.equal(personalMemo.fuel.you,8);assert.equal(personalMemo.canRestart,false);
  assert.equal(personalMemo.stint.laps,publicMemo.stint.laps,'shared stint estimate is independent of the viewer');
  const simultaneous={...LIVE,track:'Grand Prix of Long Beach',at:Date.now()+100000,laps:Array.from({length:20},(_,i)=>liveLap(i+1)),stops:[]};
  for(const user of users)await saveLive(env,user,JSON.stringify(simultaneous));
  const together=(await req('/api/training/memo?circuit=long-beach','GET',null,'admin')).data;
  assert.equal(together.collection.pilots,5);assert.equal(together.collection.laps,100);assert.equal(together.collection.state,'stable','simultaneous sessions from different pilots are distinct');
  DB.reads=[];
  await req('/api/training/memo?circuit=spa','GET',null,'admin');
  assert.ok(!DB.reads.some(read=>/SELECT.*\b(sample|summary|laps)\b.*FROM training_(live|memo_contributions|memo_pilots)/s.test(read.sql)),'warmed shared publication reads no per-pilot arrays');
  assert.equal((await req('/api/training/memo/restart','POST',{reason:'Game 1.5'},'pilot')).status,403);
  assert.equal((await req('/api/training/memo/restart','POST',{reason:''},'admin')).status,400);
  assert.equal((await req('/api/training/memo/restart','POST',{reason:'Game 1.5'},'admin')).status,200);
  result=await collectiveMemo(env,entry);
  assert.equal(result.collection.state,'collecting');assert.equal(result.collection.previous,true);
  assert.equal(result.collection.laps,0);assert.equal(result.collection.reason,'Game 1.5');assert.equal(JSON.stringify(result.sheet),frozen);
  await collectMemo(env,users[0],session(9,100,at),'backlog','spa');
  assert.equal((await collectiveMemo(env,entry)).collection.laps,0,'pre-update session is excluded');
  const renewedAt=result.collection.startedAt+MEMO_PERIOD;
  result=await collectiveMemo(env,entry,renewedAt);
  assert.equal(result.collection.startedAt,renewedAt);assert.equal(result.collection.renewAt,renewedAt+MEMO_PERIOD);
  assert.equal(JSON.stringify(result.sheet),frozen);assert.equal(result.collection.reason,'Renouvellement de 15 jours');
  // The last published memo survives raw telemetry retention and pilot summary expiry.
  DB.db.prepare('DELETE FROM training_live').run();DB.db.prepare('DELETE FROM training_memo_pilots').run();
  assert.equal((await req('/api/training/memo?circuit=spa','GET',null,'admin')).data.fuel.median,3);
});

test('memo aggregates a contributor across sessions, ignores replay and bounds samples while waiting for quorum',async()=>{
  const {login,env,DB}=harness();await login(PILOT,'pilot','Alice');
  const user=DB.db.prepare('SELECT id FROM users WHERE name=?').get('Alice').id;
  const at=Date.now(),entry={circuit:'spa',car:LIVE.car,track:LIVE.track,car_class:LIVE.class};
  const session=(fuel,count)=>cleanLive({...LIVE,at,laps:Array.from({length:count},(_,i)=>liveLap(i+1,{fuel})),stops:[]});
  await collectMemo(env,user,session(1,10),'first','spa',at);
  await collectMemo(env,user,session(3,20),'second','spa',at);
  await collectMemo(env,user,session(3,20),'second','spa',at);
  let result=await collectiveMemo(env,entry,at);
  assert.equal(result.collection.laps,30);assert.equal(result.sheet.fuel.median,2.33);
  await collectMemo(env,user,session(2,200),'large','spa',at);
  result=await collectiveMemo(env,entry,at);assert.equal(result.collection.laps,100);
  await collectMemo(env,user,session(8,50),'overflow','spa',at);
  assert.equal((await collectiveMemo(env,entry,at)).collection.laps,100);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS n FROM training_memo_contributions').get().n,3);
  await restartMemo(env,'Test renewal',at+1);
  await collectMemo(env,user,session(9,50),'old-cycle','spa',at+1);
  assert.equal((await collectiveMemo(env,entry,at+1)).collection.laps,0);
});

test('a stop takes the game’s time: tyres, ducts and brakes after, fuel, energy, wing and driver at the same time', () => {
  assert.equal(stopTime(SERVICE_296,{fuel:10.25,energy:10.3,tyres:4}),17);
  assert.equal(stopTime(SERVICE_296,{fuel:43.4,energy:46,wing:true}),25);
  assert.equal(stopTime(SERVICE_296,{fuel:84,energy:85,tyres:4,ductFront:true,ductRear:true}),65);
  assert.equal(stopTime(SERVICE_296,{fuel:5,driver:true}),25);
  assert.equal(stopTime(null,{fuel:10}),0);
});

test('the circuit sheet shows the pilots’ median from a threshold (by default one pilot and 5 laps), and the viewer’s own figure', () => {
  const laps=(fuel,ve,wear,count=12)=>Array.from({length:count},(_,i)=>({n:i+1,t:80+i/10,fuel,ve,wear:[wear,wear-0.1,wear,wear+0.1],temp:[73,72,74,75],compound:'Medium',track:30.8,pit:false,invalid:false}));
  const sessions=[{user:'a',capacity:120,laps:laps(2.0,2.0,0.4)},{user:'b',capacity:120,laps:laps(2.1,2.1,0.5)}];
  const min={pilots:3,laps:30};
  assert.equal(memoSheet({sessions:sessions.slice(0,1),viewer:'b'}).energy.median,2);
  let sheet=memoSheet({min,sessions,viewer:'b',laneStops:[{lane:60.45,stopped:17.13},{lane:61,stopped:25}],service:SERVICE_296,game:{fuel:2.06,ve:2.12,ideal:92}});
  assert.equal(sheet.lane.through,39.7);assert.equal(sheet.service.source,'game');
  assert.deepEqual([sheet.energy.median,sheet.energy.you,sheet.energy.game,sheet.energy.pilots],[null,2.1,2.12,2]);
  // Without the pilots' median, a stint is planned with the viewer's own figures.
  assert.deepEqual(sheet.stint,{laps:47,by:'energy',fuel:98.7,wear:[23.5,18.8,23.5,28.2]});
  sessions.push({user:'c',capacity:120,laps:[...laps(2.2,2.2,0.6),{...laps(9,9,9,1)[0],t:200}]});
  sheet=memoSheet({min,sessions,viewer:'b'});
  assert.deepEqual([sheet.energy.median,sheet.energy.low,sheet.energy.high,sheet.energy.laps],[2.1,2.05,2.15,36]);
  // The wear of a lap is the average of the four tyres; each tyre has its own wear, range and temperature.
  assert.deepEqual([sheet.tyres[0].name,sheet.tyres[0].median,sheet.tyres[0].worst,sheet.tyres[0].temp],['Medium',0.5,3,74]);
  assert.deepEqual(sheet.tyres[0].wheels[3],{wear:0.6});
  assert.equal(sheet.fuel.ratio,0.83);assert.equal(sheet.service,null);
});

test('the circuit sheet on the site: every circuit driven, the car’s service times from the game, no names', async () => {
  const {req,send,login,env}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');
  await req('/api/community/modules','PATCH',{training:true},'admin');
  const keyOf=async actor=>{const program=await send('/api/training/sync','POST',actor,{raw:''});return new TextDecoder().decode(new Uint8Array(await program.arrayBuffer()).slice(4096)).match(/([a-f0-9]{64})/)[1];};
  const push=async(actor,body)=>send('/api/training/live','POST','sync',{raw:JSON.stringify(body),headers:{'Content-Type':'application/json',Authorization:'Bearer '+await keyOf(actor)}});
  const lb={at:1790000200000,track:'Grand Prix of Long Beach',car:'Ferrari 296 LMGT3 Evo',class:'GT3',capacity:120,laps:[liveLap(1,{fuel:2.1,ve:2.15}),liveLap(2,{fuel:2.1,ve:2.15})],
    stops:[{lap:12,lane:60.45,stopped:17.13,fuel:10.25,ve:10.3,tyres:4}],service:{...SERVICE_296,brakes:'x'},game:{fuel:2.06,ve:2.12,ideal:92}};
  assert.equal((await push('pilot',lb)).status,200);
  assert.equal((await push('mate',{...LIVE,at:1790000300000})).status,200);
  const {status,data}=await req('/api/training/memo?circuit=long-beach','GET',null,'mate');
  assert.equal(status,200);
  assert.deepEqual(data.circuits.map(item=>item.key).sort(),['long-beach','spa']);
  assert.equal(data.car.car,'Ferrari 296 LMGT3 Evo');assert.equal(data.lane.through,43.3);
  assert.equal(data.service.wing,25);assert.equal(data.service.brakes,null);
  // Bob never drove there: no figure of his, and Alice's alone is not shown.
  assert.deepEqual([data.energy.you,data.energy.median,data.energy.game],[null,null,2.12]);
  assert.ok(!JSON.stringify(data).includes('Alice'));
  const alice=(await req('/api/training/memo?circuit=long-beach','GET',null,'pilot')).data;
  assert.equal(alice.energy.you,2.15);assert.equal(alice.levels,null);assert.equal(alice.bop?.version,'1.4.2');
  await refreshLaptimes(env,async()=>new Response(LAPTIMES));
  const withLevels=(await req('/api/training/memo?circuit=long-beach','GET',null,'pilot')).data;
  assert.deepEqual([withLevels.levels.q,withLevels.levels.you.level,withLevels.levels.you.next],[78.16,'Offline',{name:'Tail-ender',time:83.26}]);
  assert.deepEqual(withLevels.source,{name:'Ohne Speed',title:'LMU laptimes spreadsheet',url:'https://www.youtube.com/@ohne_speed',updated:'2026-10-02'});
});

test('the BoP of a car on a circuit: LMU’s line for all its versions, the main layout, the class LMU writes', () => {
  assert.equal(BOP.version,'1.4.2');assert.equal(BOP.layouts.length,21);
  const ferrari=bopFor(BOP,'long-beach','Ferrari 296 LMGT3 Evo','GT3');
  assert.deepEqual([ferrari.car,ferrari.layout,ferrari.weight,ferrari.power,ferrari.energy,ferrari.wingMin,ferrari.wingMax,ferrari.compounds],['Ferrari 296 LMGT3','Long Beach',1442,86,775,0.6,4.5,[]]);
  const peugeot=bopFor(BOP,'le-mans','Peugeot 9x8','Hyper');
  assert.deepEqual([peugeot.car,peugeot.layout,peugeot.compounds],['Peugeot 9x8','Le Mans',['Soft','Medium','Hard']]);
  assert.equal(bopFor(BOP,'le-mans','Peugeot 9x8 Evo','Hyper').car,'Peugeot 9x8 Evo');
  assert.deepEqual(bopFor(BOP,'bahrain','Isotta Tipo 6','Hyper').changes,{weight:4,energy:-46});
  assert.equal(bopFor(BOP,'lusail','Oreca 07','LMP2_ELMS').car,'Oreca 07 ELMS');
  assert.equal(bopFor(BOP,'lusail','Oreca 07','LMP2').car,'Oreca 07 WEC');
  assert.deepEqual([bopFor(BOP,'bahrain','Porsche 911 RSR-19','GTE').tank,bopFor(BOP,'bahrain','Porsche 911 RSR-19','GTE').refuel],[98,3.2666]);
  assert.equal(bopFor(BOP,'long-beach','Unknown car','GT3'),null);
  assert.equal(bopFor(BOP,'nowhere','Ferrari 296 LMGT3','GT3'),null);
});

const LAPTIMES=readFileSync(new URL('./fixtures/laptimes.csv',import.meta.url),'utf8');
test('reference lap times: levels by name from the spreadsheet, read again once a day', async () => {
  const rows=parseLaptimes(LAPTIMES), lb=rows.find(row=>row.circuit==='long-beach');
  assert.equal(rows.length,4);assert.equal(lb.q,78.16);assert.deepEqual(lb.fastest,{car:'Corvette Z06',time:77.97});
  assert.deepEqual([levelOf(80.887,lb),levelOf(78.2,lb),levelOf(82.2,lb),levelOf(90,lb),levelOf(null,lb)],['Good','Alien','Midpack','Offline',null]);
  assert.deepEqual(levelBands(lb).find(band=>band.name==='Good'),{name:'Good',from:79.34,to:80.91});
  const {env}=harness(), calls=[];
  const fetcher=async url=>{calls.push(url);return new Response(LAPTIMES);};
  assert.equal(await refreshLaptimes(env,fetcher),true);
  assert.equal(await refreshLaptimes(env,fetcher),false);
  assert.equal(calls.length,1);
  assert.equal((await env.DB.prepare("SELECT updated FROM training_reference WHERE id='laptimes'").first()).updated,'2026-10-02');
  const other=harness().env;
  await assert.rejects(refreshLaptimes(other,async()=>new Response('nothing here')),/unreadable/);
  assert.match(JSON.parse((await other.DB.prepare("SELECT data FROM training_reference WHERE id='laptimes-error'").first()).data).error,/^1\. 0 rows: nothing here \| 2\./);
  // Following Google's redirect gives another tab: the redirect followed by hand gives the lap times.
  const asked=[];
  await refreshLaptimes(other,async(url,options)=>{asked.push(options.redirect);
    if(url==='https://google.test/one-off')return new Response(LAPTIMES);
    return options.redirect==='manual'?new Response('',{status:302,headers:{Location:'https://google.test/one-off'}}):new Response('Spa,,,,1.4+');});
  assert.deepEqual(asked,['follow','manual','follow']);
  assert.equal(await other.DB.prepare("SELECT 1 FROM training_reference WHERE id='laptimes-error'").first(),null);
});

test('the SimHub plugin gets the same kind of key as a code, which replaces the program one', async () => {
  const {req,send,login}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  await req('/api/community/modules','PATCH',{training:true},'admin');
  const program=await send('/api/training/sync','POST','pilot',{raw:''});
  const old=new TextDecoder().decode(new Uint8Array(await program.arrayBuffer()).slice(4096)).match(/([a-f0-9]{64})/)[1];
  const {status,data}=await req('/api/training/sync/code','POST',{},'pilot');
  assert.equal(status,200);
  const [,origin,key]=data.code.match(/^EMSYNC1 (\S+) ([a-f0-9]{64}) EMSYNC1$/);
  assert.equal(origin,ROOT);
  const collect=auth=>send('/api/training/collector','POST','sync',{raw:XML,headers:{'Content-Type':'application/xml',Authorization:'Bearer '+auth}});
  assert.equal((await collect(old)).status,401);
  assert.equal((await collect(key)).status,200);
});

test('an online results file: the pilot is found by name, with the laps of his turns, tyre wear and top speed', () => {
  assert.throws(()=>parseResults(ONLINE),error=>error.code==='driver'&&error.drivers.length===18);
  assert.throws(()=>parseResults(ONLINE,['Personne']),/ton nom LMU n’y est pas/);
  const fast=parseResults(ONLINE,['pilote 01']);
  assert.deepEqual([fast.venue,fast.car,fast.carClass,fast.kind,fast.laps.length],['Circuit de Barcelona','Genesis GMR001','Hyper','Practice1',14]);
  const lap=fast.laps.find(item=>item.n===8);
  assert.deepEqual([lap.t,lap.top,lap.fuel,lap.ve,lap.compound],[95.0398,298.6,2,2.7,'Medium']);
  assert.deepEqual(lap.wear,[1.6,0.8,1.2,1.2]);
  // New tyres on lap 14: nothing worn is counted there.
  assert.equal(fast.laps.find(item=>item.n===14).wear,null);
  // The shared car: lap 1 was driven by someone else.
  const shared=parseResults(ONLINE,['Moi Pilote']);
  assert.deepEqual([shared.car,shared.laps.map(item=>item.n)],['Peugeot 9x8',[2,3,4]]);
});

test('an online file waits for the pilot name, then is read; the sync program can send the name itself', async () => {
  // Kept 120 days: the file is dated yesterday here.
  const recent=ONLINE.replace(/<DateTime>\d+<\/DateTime>/g,`<DateTime>${Math.floor(Date.now()/1000)-86400}</DateTime>`);
  const {req,send,login}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  await req('/api/community/modules','PATCH',{training:true},'admin');
  let response=await upload(send,'pilot',recent);
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.pending,true);assert.equal(result.drivers.length,18);
  let data=(await req('/api/training','GET',null,'pilot')).data;
  assert.equal(data.pending.files,1);assert.ok(data.pending.drivers.includes('Pilote 01'));assert.equal(data.sessions.length,0);
  assert.equal((await req('/api/training/profile','PUT',{lmuName:''},'pilot')).status,400);
  assert.equal((await req('/api/training/profile','PUT',{lmuName:'Pilote 01'},'pilot')).data.added,1);
  data=(await req('/api/training','GET',null,'pilot')).data;
  assert.equal(data.pending,null);assert.equal(data.lmuName,'Pilote 01');
  // His name now known, an online file without it is a session he did not drive: refused, not kept waiting.
  response=await upload(send,'pilot',recent.replaceAll('Pilote 01','Pilote 99'));
  assert.equal(response.status,400);
  assert.equal((await req('/api/training','GET',null,'pilot')).data.pending,null);
  assert.equal(data.sessions[0].car,'Genesis GMR001');assert.equal(data.sessions[0].laps,14);
  // The program sends the name read in LMU's settings: the pilot of the shared Peugeot is found at once.
  await login(MATE,'mate','Bob');
  const program=await send('/api/training/sync','POST','mate',{raw:''});
  const key=new TextDecoder().decode(new Uint8Array(await program.arrayBuffer()).slice(4096)).match(/([a-f0-9]{64})/)[1];
  response=await send('/api/training/collector','POST','sync',{raw:recent,headers:{'Content-Type':'application/xml',Authorization:'Bearer '+key,'X-LMU-Name':'Moi%20Pilote'}});
  assert.deepEqual(await response.json(),{ok:true,created:true,venue:'Circuit de Barcelona',laps:3});
});
