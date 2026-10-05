import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {linkTestServer, setMember, ORGA_ROLE} from './fixtures/discord-server.mjs';
import {parseResults, analyse, programSteps, adviceFor, todaySession, circuitOf, cleanLive, analyseLive} from '../shared/training.mjs';

// Individual training (migration 0046): LMU results files, the program, the advice and the sync program.
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
  return {DB,req,send,login};
}
const XML=readFileSync(new URL('./fixtures/lmu-results-practice.xml',import.meta.url),'utf8');
// The same session another day, by another pilot: only the date and the lap times change.
const variant=(xml,day,shift)=>xml.replace(/<DateTime>\d+<\/DateTime>/g,`<DateTime>${1790000000+day*86400}</DateTime>`).replace(/>(1\d\d\.\d{4})<\/Lap>/g,(_,t)=>`>${(Number(t)+shift).toFixed(4)}</Lap>`);
const upload=(send,actor,xml)=>send('/api/training/sessions','POST',actor,{raw:xml,headers:{'Content-Type':'application/xml'}});

test('a results file gives the player laps, fuel and sectors, and a program from them', () => {
  const session=parseResults(XML);
  assert.deepEqual([session.venue,session.car,session.carClass,session.kind,session.laps.length],['Circuit de Spa-Francorchamps','Alpine A424','Hypercar','Practice1',25]);
  assert.equal(session.at,1790000000000);
  assert.deepEqual(session.laps[13],{n:14,t:152.4,s:[41.148,51.816,59.436],pit:true,fuel:null,ve:null});
  assert.equal(session.laps[14].t,null);assert.equal(session.laps[12].fuel,3.6);
  assert.throws(()=>parseResults('<html></html>'),/fichier de résultats LMU/);
  assert.throws(()=>parseResults(XML.replace('<isPlayer>1</isPlayer>','<isPlayer>0</isPlayer>')),/Ton pilote/);
  assert.equal(circuitOf(session.venue),'spa');assert.equal(circuitOf('Circuit de la Sarthe'),'le-mans');
  const a=analyse([session]);
  assert.deepEqual([a.totalLaps,a.longestRun,a.pitDone,a.fuelPerLap,a.tankLaps],[24,10,true,3.6,27]);
  const steps=programSteps(a,['conditions']);
  assert.deepEqual(steps.map(step=>step.done),[true,true,false,true,true]);
  assert.equal(steps[4].proof,'Coché par toi');
  // The first step left (a full tank) shapes today's session; the eve of the race is always short.
  assert.equal(todaySession(a,steps,{minutes:60}).blocks[0].laps,27);
  assert.equal(todaySession(a,steps,{minutes:30,daysLeft:1}).focus,'Veille de course');
  assert.match(adviceFor(a)[0].title,/Secteur 3/);
  assert.equal(adviceFor(analyse([]))[0].key,'none');
});

// Online, LMU marks every driver as the player: the pilot is found by his LMU name, on the car or in its swaps.
const online=XML.replace('<isPlayer>0</isPlayer>','<isPlayer>1</isPlayer>');
const ONLINE_SWAP=online.replace('<Name>Max &amp; Co</Name>','<Name>Equipe</Name><Swap startLap="1" endLap="25">Zoé Durand</Swap>');

test('an online results file gives the laps of the pilot named as in LMU, never those of the first driver', async () => {
  assert.throws(()=>parseResults(online),/Séance en ligne/);
  assert.throws(()=>parseResults(online,['Personne']),/Séance en ligne/);
  assert.equal(parseResults(online,['MAX & CO']).laps.length,25);
  assert.equal(parseResults(online,['IA Rival']).laps.length,3);
  assert.equal(parseResults(ONLINE_SWAP,['zoe durand']).laps.length,25);
  const {req,send,login}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  await req('/api/community/modules','PATCH',{training:true},'admin');
  const key=new TextDecoder().decode(new Uint8Array(await (await send('/api/training/sync','POST','pilot',{raw:''})).arrayBuffer()).slice(4096)).match(/([a-f0-9]{64})/)[1];
  const collect=headers=>send('/api/training/collector','POST','sync',{raw:ONLINE_SWAP,headers:{'Content-Type':'application/xml',Authorization:'Bearer '+key,...headers}});
  assert.equal((await collect({})).status,400);
  assert.equal((await collect({'X-LMU-Player':'%E0%A4%A'})).status,400);
  assert.equal((await collect({'X-LMU-Player':encodeURIComponent('Zoé Durand')})).status,200);
  assert.equal((await req('/api/training','GET',null,'pilot')).data.analysis.totalLaps,24);
});

test('the pilot drops his files, sees his program, and compares with the pilots of the site without names', async () => {
  const {req,send,login}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');await login('444444444444444444','other','Chloé');
  assert.equal((await req('/api/training','GET',null,'pilot')).status,404);
  assert.equal((await req('/api/community/modules','PATCH',{training:true},'admin')).status,200);
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
  assert.equal((await req('/api/training/marks','PUT',{track:data.track.key,step:'conditions',done:true},'pilot')).status,200);
  assert.equal((await req('/api/training/marks','PUT',{track:data.track.key,step:'nope',done:true},'pilot')).status,400);
  assert.equal((await req('/api/training','GET',null,'pilot')).data.steps[4].done,true);
  // Removing a session removes it for Alice only.
  assert.equal((await req(`/api/training/sessions/${data.sessions[0].id}`,'DELETE',null,'mate')).status,200);
  assert.equal((await req('/api/training','GET',null,'pilot')).data.sessions.length,1);
  assert.equal((await req(`/api/training/sessions/${data.sessions[0].id}`,'DELETE',null,'pilot')).status,200);
  assert.equal((await req('/api/training','GET',null,'pilot')).data.sessions.length,0);
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

test('the pit guide gives the stops of every pilot per class, without names', async () => {
  const {req,send,login}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  await req('/api/community/modules','PATCH',{training:true},'admin');
  const program=await send('/api/training/sync','POST','pilot',{raw:''});
  const key=new TextDecoder().decode(new Uint8Array(await program.arrayBuffer()).slice(4096)).match(/([a-f0-9]{64})/)[1];
  await send('/api/training/live','POST','sync',{raw:JSON.stringify(LIVE),headers:{'Content-Type':'application/json',Authorization:'Bearer '+key}});
  const data=(await req('/api/training/pits','GET',null,'pilot')).data;
  assert.deepEqual(data.classes.map(item=>[item.name,item.pilots,item.stops,item.tyres4,item.fuelRate]),[['Hypercar',1,3,9,3]]);
  assert.ok(!JSON.stringify(data).includes('Alice'));
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
