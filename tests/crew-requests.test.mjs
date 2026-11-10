import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {linkTestServer, setMember, ORGA_ROLE} from './fixtures/discord-server.mjs';
import {crewRequestCard, requestsChannel, cleanCrewRequestCards} from '../server/crew-request-discord.mjs';
import {layoutInput} from '../server/discord-layout.mjs';

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
  return {DB,env,req,login};
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

// « Demander un équipage » on Discord (Nathan 2026-11-09): the requests posted in the admins' channel, without a ping;
// the same card turns green once the crew is created, and goes when the request is cancelled.
test('a crew request is posted on Discord, turns green once created and goes when cancelled',async()=>{
  const {DB,env,req,login}=harness();
  await login(ADMIN,'admin');await login(ORGA,'orga',[ORGA_ROLE]);await login(PILOT,'pilot');await login(MATE,'mate');
  await req('/api/events','POST',{name:'6h test',categories:['GT3'],departures:[{date:'2090-10-15',time:'15:00'}]},'admin');
  const event=(await req('/api/events','GET',null,'pilot')).data.events[0],dep=event.departures[0];
  const base=`/api/events/${event.id}/departures/${dep.id}`;
  const mine=(await req(base+'/registrations','POST',{name:'Pilot',category:'GT3',status:'whole'},'pilot')).data.id;
  const mate=(await req(base+'/registrations','POST',{name:'Mate',category:'GT3',status:'whole'},'mate')).data.id;
  const community=DB.db.prepare('SELECT id FROM communities LIMIT 1').get().id;
  DB.db.prepare(`INSERT INTO community_recap_settings(community_id,mode,scope,guild_id,destination_id,destination_name,layout) VALUES(?,?,?,?,?,?,?)`)
    .run(community,'events','all','g','','',JSON.stringify({v:1,mode:'events',sims:'all',requests:'900000000000000001'}));
  env.DISCORD_BOT_TOKEN='bot';
  const calls=[],realFetch=globalThis.fetch;
  globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),method:init.method,body:init.body?JSON.parse(init.body):null});return new Response(JSON.stringify({id:'800000000000000001'}),{headers:{'Content-Type':'application/json'}});};
  try{
    const sent=await req(base+'/crew-requests','POST',{name:'Les Tortues',category:'GT3',registrationIds:[mate]},'pilot');
    assert.equal(sent.status,201);
    const post=calls.find(call=>call.method==='POST'&&call.url.endsWith('/channels/900000000000000001/messages'));
    assert.ok(post,'the card is posted in the chosen channel');
    assert.deepEqual(post.body.allowed_mentions,{parse:[]});
    assert.match(post.body.embeds[0].title,/Demande d’équipage/);assert.match(post.body.embeds[0].description,/Les Tortues/);
    assert.equal(DB.db.prepare('SELECT discord_message_id FROM crew_requests WHERE id=?').get(sent.data.id).discord_message_id,'800000000000000001');
    // The organiser creates it (maybe renamed): the same card turns green with the crew as made.
    const crew=(await req(base+'/crews','POST',{name:'Les Lièvres',category:'GT3',join:false},'orga')).data.id;
    calls.length=0;
    assert.equal((await req(`/api/crew-requests/${sent.data.id}/accept`,'POST',{crewId:crew},'orga')).status,200);
    const edit=calls.find(call=>call.method==='PATCH'&&call.url.endsWith('/messages/800000000000000001'));
    assert.ok(edit,'the card is edited');assert.match(edit.body.embeds[0].title,/ÉQUIPAGE CRÉÉ · Les Lièvres/);assert.equal(edit.body.embeds[0].color,0x23a55a);
    // Another start's request, cancelled by the pilot: its card is deleted.
    await req('/api/events','POST',{name:'4h test',categories:['GT3'],departures:[{date:'2090-11-15',time:'15:00'}]},'admin');
    const other=(await req('/api/events','GET',null,'pilot')).data.events.find(item=>item.name==='4h test'),odep=other.departures[0];
    await req(`/api/events/${other.id}/departures/${odep.id}/registrations`,'POST',{name:'Pilot',category:'GT3',status:'whole'},'pilot');
    const second=(await req(`/api/events/${other.id}/departures/${odep.id}/crew-requests`,'POST',{name:'Solo',category:'GT3'},'pilot')).data.id;
    calls.length=0;
    assert.equal((await req(`/api/crew-requests/${second}/cancel`,'POST',{},'pilot')).status,200);
    assert.ok(calls.some(call=>call.method==='DELETE'&&call.url.endsWith('/messages/800000000000000001')));
    assert.ok(mine);
  }finally{globalThis.fetch=realFetch;}
});

test('a crew request card: no channel, never on dev, stale cards cleaned',async()=>{
  assert.equal(requestsChannel(null),'');
  assert.equal(requestsChannel({enabled:0,layout:JSON.stringify({requests:'900000000000000001'})}),'');
  assert.equal(requestsChannel({enabled:1,layout:JSON.stringify({requests:'900000000000000001'})}),'900000000000000001');
  assert.equal(layoutInput({mode:'events',sims:'all',under:'top',requests:'900000000000000001'}).requests,'900000000000000001');
  assert.throws(()=>layoutInput({mode:'events',sims:'all',under:'top',requests:'général'}),/demandes d’équipage/);
  const pending=crewRequestCard({status:'pending',requester:'Max',name:'Team @everyone',category:'GT3',pilots:['Max','Léo'],eventName:'6h',game:'lmu',url:'https://x'});
  assert.ok(!pending.description.includes('@'),'no mention in a card');
  assert.match(crewRequestCard({status:'refused',requester:'Max',name:'A',by:'Nathan'}).title,/non retenue/);
  assert.equal(await cleanCrewRequestCards({SITE_ENV:'development',DISCORD_BOT_TOKEN:'bot'}),0);
});

// Nathan 2026-11-09: « la création ne sauvegarde pas ce qu'ils ont demandé ». Whatever way the organiser places the
// pilot (pilots ticked, « Ajouter à… »), his request is answered and he is told once.
test('a request is answered as soon as its pilot is placed in a crew, whatever the way',async()=>{
  const {DB,req,login}=harness();
  await login(ADMIN,'admin');await login(ORGA,'orga',[ORGA_ROLE]);await login(PILOT,'pilot');
  await req('/api/events','POST',{name:'6h test',categories:['GT3'],departures:[{date:'2090-10-15',time:'15:00'}]},'admin');
  const event=(await req('/api/events','GET',null,'pilot')).data.events[0],dep=event.departures[0];
  const base=`/api/events/${event.id}/departures/${dep.id}`;
  const mine=(await req(base+'/registrations','POST',{name:'Pilot',category:'GT3',status:'whole'},'pilot')).data.id;
  const sent=(await req(base+'/crew-requests','POST',{name:'Les Tortues',category:'GT3'},'pilot')).data.id;
  const crew=(await req(base+'/crews','POST',{name:'Autre nom',category:'GT3',join:false},'orga')).data.id;
  const version=(await req('/api/events','GET',null,'orga')).data.events[0].departures[0].crews[0].version;
  assert.equal((await req(`/api/crews/${crew}/members`,'POST',{registrationId:mine,version},'orga')).status,200);
  assert.equal(DB.db.prepare('SELECT status FROM crew_requests WHERE id=?').get(sent).status,'accepted');
  const kinds=DB.db.prepare('SELECT kind FROM notifications WHERE user_id=? ORDER BY rowid').all(PILOT).map(row=>row.kind);
  assert.deepEqual(kinds.filter(kind=>kind.startsWith('crew_')),['crew_request_accepted'],'told once, not twice');
  // The crew window still closes it afterwards (it refreshes the Discord card): no error.
  assert.equal((await req(`/api/crew-requests/${sent}/accept`,'POST',{crewId:crew},'orga')).status,200);
  assert.equal((await req(`/api/crew-requests/${sent}/refuse`,'POST',{},'orga')).status,404);
});

// Nathan 2026-11-09: « le pilote est toujours inscrit sur des horaires de la même journée ».
test('placed in a crew, the pilot leaves his other starts of the same day, not those of another day or in a crew',async()=>{
  const {req,login}=harness();
  await login(ADMIN,'admin');await login(ORGA,'orga',[ORGA_ROLE]);await login(PILOT,'pilot');
  await req('/api/events','POST',{name:'6h test',categories:['GT3'],departures:[{date:'2090-10-15',time:'15:00'},{date:'2090-10-15',time:'21:00'},{date:'2090-10-16',time:'15:00'}]},'admin');
  const event=(await req('/api/events','GET',null,'pilot')).data.events[0];
  const [first,evening,nextDay]=event.departures;
  const enter=dep=>req(`/api/events/${event.id}/departures/${dep.id}/registrations`,'POST',{name:'Pilot',category:'GT3',status:'whole'},'pilot');
  const placed=(await enter(first)).data.id;await enter(evening);await enter(nextDay);
  const crew=(await req(`/api/events/${event.id}/departures/${first.id}/crews`,'POST',{name:'Crew',category:'GT3',join:false},'orga')).data.id;
  const version=(await req('/api/events','GET',null,'orga')).data.events[0].departures[0].crews[0].version;
  const added=await req(`/api/crews/${crew}/members`,'POST',{registrationId:placed,version},'orga');
  assert.equal(added.status,200);assert.equal(added.data.removedRegistrations,1);
  const mine=(await req('/api/events','GET',null,'pilot')).data.events[0].departures.map(dep=>dep.availability.filter(reg=>reg.mine).length);
  assert.deepEqual(mine,[1,0,1]);
});
