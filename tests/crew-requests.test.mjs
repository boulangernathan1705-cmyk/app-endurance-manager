import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {linkTestServer, setMember, ORGA_ROLE} from './fixtures/discord-server.mjs';

// « Demander un équipage » (migration 0091): a pilot without « Équipages » proposes a crew, the organisers are told on
// the site, check it on the « Équipages » page, create it or refuse it. The pilot never becomes its manager.
const ROOT='https://site.example';
const ADMIN='111111111111111111', ORGA='444444444444444444', PILOT='222222222222222222', MATE='333333333333333333';
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}
function harness(){
  const DB=new D1();
  linkTestServer(DB.db);
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
  async function login(discordId,actor,roles=[]){
    const start=await worker.fetch(new Request(ROOT+'/api/auth/discord',{headers:{'CF-Connecting-IP':actor}}),env);
    const state=new URL(start.headers.get('Location')).searchParams.get('state');
    const jar={};for(const raw of start.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');jar[pair.slice(0,i)]=pair.slice(i+1);}jars.set(actor,jar);
    const realFetch=globalThis.fetch;
    globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/token')?{access_token:'mock'}:{id:discordId,username:`Pilot ${discordId}`}),{headers:{'Content-Type':'application/json'}});
    try{await req(`/api/auth/discord/callback?code=test&state=${state}`,'GET',null,actor);}finally{globalThis.fetch=realFetch;}
    setMember(DB.db,discordId,roles);
  }
  return {DB,req,login};
}

test('a pilot asks for a crew, every organiser is told, one creates it and the pilot is told',async()=>{
  const {DB,req,login}=harness();
  await login(ADMIN,'admin');await login(ORGA,'orga',[ORGA_ROLE]);await login(PILOT,'pilot');await login(MATE,'mate');
  assert.equal((await req('/api/events','POST',{name:'6h test',categories:['Hypercar','GT3'],departures:[{date:'2090-10-15',time:'15:00'}]},'admin')).status,201);
  const event=(await req('/api/events','GET',null,'pilot')).data.events[0],dep=event.departures[0];
  const base=`/api/events/${event.id}/departures/${dep.id}`;
  // Creating a crew stays with the organisers.
  assert.equal((await req(base+'/crews','POST',{name:'Mine',category:'GT3'},'pilot')).status,403);
  // Not entered: no request.
  assert.equal((await req(base+'/crew-requests','POST',{name:'Les Tortues',category:'GT3'},'pilot')).status,409);
  const mine=(await req(base+'/registrations','POST',{name:'Pilot',category:'GT3',status:'whole'},'pilot')).data.id;
  const mate=(await req(base+'/registrations','POST',{name:'Mate',category:'GT3',status:'whole'},'mate')).data.id;
  const sent=await req(base+'/crew-requests','POST',{name:'Les Tortues',category:'GT3',registrationIds:[mate]},'pilot');
  assert.equal(sent.status,201);
  // A second request on the same start replaces the first.
  const again=await req(base+'/crew-requests','POST',{name:'Les Tortues 2',category:'GT3',registrationIds:[mate]},'pilot');
  assert.equal(again.status,201);
  // The organisers (role « crews », and the admin from ADMIN_DISCORD_IDS only if he has a membership) see it; a pilot sees only his own.
  const seen=(await req('/api/crew-requests','GET',null,'orga')).data.requests;
  assert.equal(seen.length,1);assert.equal(seen[0].name,'Les Tortues 2');assert.deepEqual(seen[0].registrationIds,[mine,mate]);
  assert.equal((await req('/api/crew-requests','GET',null,'mate')).data.requests.length,0);
  assert.equal((await req('/api/crew-requests','GET',null,'pilot')).data.requests[0].mine,true);
  const told=DB.db.prepare("SELECT user_id FROM notifications WHERE kind='crew_request'").all().map(row=>row.user_id);
  assert.ok(told.includes(ORGA),'the organiser is told on the site');assert.ok(!told.includes(PILOT));assert.ok(!told.includes(MATE));
  // A pilot does not treat requests.
  assert.equal((await req(`/api/crew-requests/${again.data.id}/refuse`,'POST',{},'mate')).status,403);
  // The organiser creates the crew without being put in it, adds the pilots, then closes the request.
  const crew=await req(base+'/crews','POST',{name:'Les Tortues 2',category:'GT3',join:false},'orga');
  assert.equal(crew.status,201);assert.equal(crew.data.joined,false);
  assert.equal((await req(`/api/crew-requests/${again.data.id}/accept`,'POST',{crewId:crew.data.id},'orga')).status,200);
  assert.equal((await req('/api/crew-requests','GET',null,'orga')).data.requests.length,0);
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE kind='crew_request_accepted' AND user_id=?").get(PILOT).n,1);
});

test('joining an open crew never makes the pilot its manager',async()=>{
  const {req,login}=harness();
  await login(ADMIN,'admin');await login(ORGA,'orga',[ORGA_ROLE]);await login(PILOT,'pilot');
  await req('/api/events','POST',{name:'6h test',categories:['GT3'],departures:[{date:'2090-10-15',time:'15:00'}]},'admin');
  const event=(await req('/api/events','GET',null,'pilot')).data.events[0],dep=event.departures[0];
  const base=`/api/events/${event.id}/departures/${dep.id}`;
  const crew=(await req(base+'/crews','POST',{name:'Open',category:'GT3',join:false},'orga')).data.id;
  const mine=(await req(base+'/registrations','POST',{name:'Pilot',category:'GT3',status:'whole'},'pilot')).data.id;
  let listing=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew}/members`,'POST',{registrationId:mine,version:listing.version,selfJoin:true},'pilot')).status,200);
  listing=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal(listing.canManage,false);assert.equal(listing.ownedByMe,false);
});
