import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {METRICS,collective,pilotSummary,autonomy,pitEstimate,cleanMetrics,cleanPitProfile,scopeKey} from '../shared/memo.mjs';
import {parseReference} from '../shared/memo-reference.mjs';
import {memoApi,memoCollector,refreshMemoReference,cleanScope,memoEnabled} from '../server/memo.mjs';
import {communityById} from '../server/community.mjs';
import {linkTestServer,setMember,DEV_COMMUNITY} from './fixtures/discord-server.mjs';
import worker from '../server/worker.mjs';
const scope={circuit:'spa',layout:'Spa WEC',car:'Toyota GR010 Hybrid',weather:'dry',compound:'Medium',gameVersion:'test-v1'};
const epoch=()=>Math.floor(Date.now()/1000);
const sample=(user,value,count=5)=>({user_id:user,metrics:{fuelLitres:{value,count}}});

class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())this.db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));}
  prepare(sql){const db=this.db;return {params:[],bind(...params){this.params=params;return this;},async first(){return db.prepare(sql).get(...this.params)||null;},async all(){return {results:db.prepare(sql).all(...this.params)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.params).changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());this.db.exec('COMMIT');return results;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
async function harness(){
  const DB=new D1();linkTestServer(DB.db);
  for(const id of ['a','b','c','d']){DB.db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run(id,'Private '+id);setMember(DB.db,id);}
  const env={DB,APP_ORIGIN:'https://site.example',SITE_ENV:'development',MEMO_CONNECTOR_READY:'true'};
  const community=await communityById(env,DEV_COMMUNITY);
  const request=(path,method='GET',input)=>new Request('https://site.example'+path,{method,headers:{Origin:'https://site.example','Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(input||{})});
  const call=async(path,method='GET',input,user='a',manager=false)=>memoApi(path.split('?')[0],method,request(path,method,input),env,{user:{id:user},manager},community);
  return {DB,env,community,call,request};
}

test('memo: equal weight per pilot, own pilot excluded and minimum enforced per metric',()=>{
  const rows=[sample('a',100,1000),sample('b',2),sample('c',4),sample('d',6)];
  assert.equal(collective(rows,'a').metrics.fuelLitres.value,4);
  assert.equal(collective(rows).metrics.fuelLitres.value,28);
  assert.deepEqual(collective(rows.slice(0,3),'a').metrics,{});
  assert.deepEqual(pilotSummary([sample('a',2,4)]),{});
  assert.equal(pilotSummary([sample('a',0)]).fuelLitres.value,0);
  assert.equal(pilotSummary([{metrics:{pitTransit:{value:30,count:1}}}]).pitTransit.value,30);
  assert.equal(collective([...Array.from({length:5},()=>sample('a',2)),sample('a',80),sample('b',2),sample('c',2)]).metrics.fuelLitres.value,2);
});

test('memo: autonomy uses whole laps, limiting resource and measured pace only',()=>{
  const metrics={fuelLitres:{value:3},energyPercent:{value:4.2},lapSeconds:{value:120}};
  assert.deepEqual(autonomy(metrics,{fuelLitres:75,energyPercent:100}),{laps:23,seconds:2760,limiting:'energy',basedOn:['fuel','energy']});
  assert.equal(autonomy(metrics,{fuelLitres:0}).laps,0);
  assert.equal(autonomy({}, {fuelLitres:75}),null);
  assert.equal(autonomy({fuelLitres:{value:3}},{fuelLitres:75}).seconds,null);
});

const profile=()=>cleanPitProfile({source:'Controlled test, not production',pitTransit:50,pitLoss:30,services:{
  fuel:{after:[],basis:'litres',fixed:1,perUnit:1},tyres2:{after:['fuel'],seconds:5},tyres4:{after:['fuel'],seconds:12},driver:{after:[],seconds:42},brakes:{after:['tyres4'],seconds:100},repair:{after:['fuel'],seconds:0}
}});
test('memo: service DAG handles a long swap spanning fuel and tyres, not phase addition',()=>{
  const p=profile();
  assert.equal(pitEstimate(p,['fuel','tyres4','driver'],5).stationary,42);
  assert.equal(pitEstimate(p,['fuel','tyres4','driver'],40).stationary,53);
  assert.equal(pitEstimate(p,['brakes','fuel'],5).stationary,106,'unselected tyre node still carries fuel dependency');
  assert.equal(pitEstimate(p,['fuel','tyres4'],40).loss,83);
  assert.equal(pitEstimate(p,['fuel','tyres4'],40).passage,103);
  assert.equal(pitEstimate(p,['fuel','wing'],40).stationary,null);
  assert.equal(pitEstimate(p,['repair'],null,null).stationary,null);
  assert.equal(pitEstimate(p,['repair'],null,75).stationary,75);
  assert.equal(pitEstimate(p,['tyres2','tyres4']).stationary,null);
  assert.equal(pitEstimate(p,['fuel'],0).stationary,0);
  assert.equal(pitEstimate(null,['tyres4']).stationary,null);
});

test('memo: invalid metrics, cycles, missing dependencies and scope are rejected',()=>{
  for(const value of [-1,Infinity,NaN,'2',null])assert.throws(()=>cleanMetrics({fuelLitres:{value,count:10}}));
  assert.throws(()=>cleanMetrics({wearFL:{value:2,count:0}}));
  assert.throws(()=>cleanMetrics({lapSeconds:{value:0,count:10}}));
  assert.throws(()=>cleanPitProfile({source:'test',services:{driver:{seconds:42,after:['tyres4']},tyres4:{seconds:12,after:['driver']}}}));
  assert.throws(()=>cleanPitProfile({source:'test',services:{driver:{seconds:42,after:['tyres4']}}}));
  assert.throws(()=>cleanScope({...scope,car:'Unknown car'}));
  assert.throws(()=>cleanScope({...scope,weather:'mixed'}));
  assert.notEqual(scopeKey(scope),scopeKey({...scope,layout:'Other layout'}));
  assert.notEqual(scopeKey(scope),scopeKey({...scope,compound:'Wet'}));
  assert.equal(memoEnabled({}, {modules:{}}),false);
  assert.equal(memoEnabled({SITE_ENV:'development'},{modules:{}}),true);
  assert.equal(memoEnabled({SITE_ENV:'development'},{modules:{memo:false}}),false);
});

test('memo: API exposes personal values only to the contributing owner, aggregate without identities',async()=>{
  const {DB,call}=await harness();
  for(const [i,user] of ['a','b','c','d'].entries()){
    await call('/api/memo/consent','POST',{accept:true},user);
    DB.db.prepare('INSERT INTO memo_samples VALUES(?,?,?,?,?,?,?)').run(user,'one',scopeKey(scope),JSON.stringify(scope),JSON.stringify({fuelLitres:{value:i+1,count:10}}),epoch(),epoch());
  }
  const url='/api/memo/sheet?'+new URLSearchParams(scope);
  const a=await (await call(url)).json();
  assert.equal(a.personal.fuelLitres.value,1);assert.equal(a.collective.metrics.fuelLitres.value,3);
  assert.doesNotMatch(JSON.stringify(a),/Private|user_id|session_id/);
  await call('/api/memo/consent','DELETE');
  const guest=await(await call(url)).json();
  assert.equal(guest.personal,null);assert.equal(guest.contributing,false);assert.equal(guest.collective.metrics.fuelLitres.value,3);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS n FROM memo_samples WHERE user_id=?').get('a').n,0);
  DB.db.prepare('UPDATE memo_samples SET started_at=? WHERE user_id=?').run(epoch()-91*86400,'b');
  assert.deepEqual((await(await call(url)).json()).collective.metrics,{},'an old session cannot remain in the average because it was uploaded recently');
  const different=await(await call('/api/memo/sheet?'+new URLSearchParams({...scope,compound:'Soft'}))).json();
  assert.deepEqual(different.collective.metrics,{});
  await assert.rejects(call('/api/memo/pit-profile','PUT',{scope,profile:profile()}),e=>e.status===403);
  await call('/api/memo/pit-profile','PUT',{scope,profile:profile()},'a',true);
  assert.equal((await(await call(url)).json()).pit.pitLoss,30);
  DB.db.close();
});

test('memo: connector consent, gate, token hashing, idempotency, revocation and access restrictions',async()=>{
  const {DB,env,call}=await harness();
  await assert.rejects(call('/api/memo/link','POST',{}),e=>e.status===403);
  await call('/api/memo/consent','POST',{accept:true});
  env.MEMO_CONNECTOR_READY='false';await assert.rejects(call('/api/memo/link','POST',{}),e=>e.status===409);env.MEMO_CONNECTOR_READY='true';
  const {token}=await(await call('/api/memo/link','POST',{})).json();
  assert.notEqual(DB.db.prepare('SELECT token_hash FROM memo_links').get().token_hash,token);
  const send=async(data,secret=token)=>memoCollector(new Request('https://site.example/api/memo/collector',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify(data)}),env);
  const input={schema:1,sessionId:'session-1',startedAt:epoch(),scope,metrics:{fuelLitres:{value:3,count:10}}};
  await send({...input,userId:'b'});
  assert.equal(DB.db.prepare('SELECT user_id FROM memo_samples').get().user_id,'a');
  await assert.rejects(send(input),e=>e.status===429);
  DB.db.exec('UPDATE memo_links SET last_seen=0');await send({...input,metrics:{fuelLitres:{value:99,count:10}}});
  assert.equal(JSON.parse(DB.db.prepare('SELECT metrics FROM memo_samples').get().metrics).fuelLitres.value,3);
  DB.db.exec('UPDATE memo_links SET last_seen=0');setMember(DB.db,'a',[],{status:'left'});
  await assert.rejects(send({...input,sessionId:'denied'}),e=>e.status===403);
  setMember(DB.db,'a');
  await call('/api/memo/consent','DELETE');
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS n FROM memo_links').get().n,0);
  await assert.rejects(send(input),e=>e.status===401);
  await assert.rejects(send(input,'invalid'),e=>e.status===401);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS n FROM memo_samples').get().n,0);
  DB.db.close();
});

const csv='Last updated: 2026.10.15\n'+['Spa','Monza','Fuji'].map(track=>`${track}LMH,${track},v-test,2:00.00,2:01.00,2:02.00,2:03.00,2:04.00,2:05.00,2:06.00,2:07.00,2:08.00`).join('\n');
test('memo: reference parsing is validated; failed refresh retains the previous valid document',async()=>{
  assert.equal(parseReference(csv).entries.length,3);assert.equal(parseReference(csv).updated,'2026-10-15');
  assert.equal(parseReference('<html>error</html>').entries.length,0);
  const {DB,env}=await harness();
  await refreshMemoReference(env,async()=>new Response(csv));
  const before=DB.db.prepare('SELECT data,fetched_at FROM memo_reference').get();
  DB.db.exec('UPDATE memo_reference SET attempted_at=0');
  await assert.rejects(refreshMemoReference(env,async()=>new Response('changed format')));
  assert.deepEqual(DB.db.prepare('SELECT data,fetched_at FROM memo_reference').get(),before);
  DB.db.close();
});

test('memo: worker keeps browser origin and sign-in checks while collector requires bearer authentication',async()=>{
  const {env}=await harness();
  const response=await worker.fetch(new Request('https://site.example/api/memo/consent',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{"accept":true}'}),env);
  assert.equal(response.status,403);
  assert.equal((await worker.fetch(new Request('https://site.example/api/memo/collector',{method:'POST'}),env)).status,401);
  assert.equal((await worker.fetch(new Request('https://site.example/api/memo'),env)).status,401);
});
