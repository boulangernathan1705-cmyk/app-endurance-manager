import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {announceCommunity} from '../server/discord-announce.mjs';
import {buildAnnounceEvent,buildAnnounceRace,eventHook,ANNOUNCE_HOOKS} from '../server/discord-weekly-format.mjs';
import {layoutInput} from '../server/discord-layout.mjs';
import {linkTestServer,DEV_COMMUNITY,GUILD} from './fixtures/discord-server.mjs';

const ANNOUNCES='555555555555555555', PILOT='777777777777777777';
const EVENT='00000000-0000-4000-8000-0000000000e1', RACE='00000000-0000-4000-8000-0000000000e2', TOMORROW='00000000-0000-4000-8000-0000000000e3';
// 7h30 in Paris on Wednesday 28 October 2026 (winter time: UTC+1).
const MORNING=Date.parse('2026-10-28T06:30:00Z'), HOUR=3600000;
const TDZ={id:DEV_COMMUNITY,slug:'tdz',name:'Test',discordGuildId:GUILD,modules:{soloRaces:true}};
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())this.db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));linkTestServer(this.db);}
  prepare(sql){const db=this.db;return {params:[],bind(...params){this.params=params;return this;},async first(){return db.prepare(sql).get(...this.params)||null;},async all(){return {results:db.prepare(sql).all(...this.params)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.params).changes)}};}};}
}
function setup(t){
  const DB=new D1(),calls=[],messages=new Map();let counter=900000000000000000n;
  DB.db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run('111111111111111111','Orga');
  const event=(id,name,startsAt,extra={})=>DB.db.prepare(`INSERT INTO events(id,name,circuit,duration_hours,duration_minutes,categories,departures,created_by,created_at,community_id,format,sim,rounds,access,capacity,details,event_type)
    VALUES(?,?,?,?,?,'["GT3"]',?,'111111111111111111',0,?,?,?,?,?,?,?,?)`).run(id,name,extra.circuit||'spa',extra.hours||1,extra.minutes||0,JSON.stringify([{id:`start-${id.slice(-2)}`,startsAt}]),extra.community||DEV_COMMUNITY,
      extra.format||'endurance',extra.sim||null,JSON.stringify(extra.rounds||[]),extra.access||'open',extra.capacity??null,JSON.stringify(extra.details||{}),extra.type||'special');
  // An AMS2 event at 21h (TDZ, OPEN, two rounds, 20 places), a 6h at 20h with a crew, a race tomorrow (not announced).
  event(EVENT,'Coupe GT3',Date.parse('2026-10-28T20:00:00Z'),{format:'solo',sim:'ams2',circuit:'Interlagos',minutes:80,capacity:20,access:'open',
    rounds:[{circuit:'Interlagos',durationMinutes:40,categories:[],category:'GT3',practice:10,qualifying:10,weather:'sun'},{circuit:'Spa',durationMinutes:40,categories:[],category:'GT3',weather:'rain'}],
    details:{type:'OPEN',note:'La pluie attendue sur Spa.'}});
  event(RACE,'6h de Spa',Date.parse('2026-10-28T19:00:00Z'),{hours:6,minutes:360,details:{weather:'mixed'},type:'private'});
  event(TOMORROW,'4h de Monza',Date.parse('2026-10-29T19:00:00Z'),{hours:4,minutes:240,circuit:'monza'});
  DB.db.prepare(`INSERT INTO participants(id,name,user_id,created_by,created_at,community_id) VALUES('p1','Pilote 1',NULL,'111111111111111111',0,?)`).run(DEV_COMMUNITY);
  DB.db.prepare(`INSERT INTO registrations(id,event_id,departure_id,guest_hash,name,name_key,category,status,created_at,participant_id,community_id) VALUES('r1',?,'start-e2','g1','Pilote 1','pilote 1','GT3','whole',0,'p1',?)`).run(RACE,DEV_COMMUNITY);
  DB.db.prepare(`INSERT INTO crews(id,event_id,departure_id,name,category,car,created_at,community_id) VALUES('c1',?,'start-e2','Équipage A','GT3','Ferrari 296',0,?)`).run(RACE,DEV_COMMUNITY);
  DB.db.prepare(`INSERT INTO crew_members(registration_id,crew_id) VALUES('r1','c1')`).run();
  DB.db.prepare(`INSERT INTO community_recap_settings(community_id,enabled,mode,scope,guild_id,destination_id,destination_name,layout) VALUES(?,1,'events','all',?,'','',?)`)
    .run(DEV_COMMUNITY,GUILD,JSON.stringify({v:1,mode:'events',sims:'all',announce:ANNOUNCES}));
  const env={DB,APP_ORIGIN:'https://site.example',DISCORD_BOT_TOKEN:'fake',DISCORD_CLIENT_ID:'444444444444444444',DISCORD_PUBLIC_KEY:'a'.repeat(64)};
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const path=String(url).replace('https://discord.com/api/v10',''),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    calls.push({path,method,body});
    if(path.startsWith('/applications/'))return Response.json({items:[]});
    const send=path.match(/^\/channels\/(\d+)\/messages$/);
    if(send){const message={...body,id:String(counter++),channel_id:send[1]};messages.set(message.id,message);return Response.json(message);}
    const edit=path.match(/^\/channels\/(\d+)\/messages\/(\d+)$/);
    if(edit){Object.assign(messages.get(edit[2]),body);return Response.json(messages.get(edit[2]));}
    return new Response('{}',{status:404});
  };
  t.after(()=>globalThis.fetch=original);
  const settings=()=>DB.db.prepare('SELECT * FROM community_recap_settings WHERE community_id=?').get(DEV_COMMUNITY);
  return {DB,env,calls,messages,settings};
}
const sent=calls=>calls.filter(call=>call.method==='POST'&&call.path.startsWith('/channels/'));

test('at 7h30 the day\'s endurances and events are announced in order, @everyone on the first message only',async t=>{
  const {env,calls,settings}=setup(t);
  // Before 7h30: nothing.
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING-2*60000),false);
  assert.equal(calls.length,0);
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING),true);
  const posts=sent(calls);
  assert.equal(posts.length,3,'the intro, the 6h at 20h, the event at 21h; not tomorrow\'s race');
  assert.ok(posts.every(call=>call.path===`/channels/${ANNOUNCES}/messages`));
  const [intro,race,event]=posts.map(call=>call.body);
  assert.equal(intro.content,'@everyone');assert.deepEqual(intro.allowed_mentions,{parse:['everyone']});assert.equal(intro.flags,undefined);
  assert.match(intro.embeds[0].description,/\*\*1 event\*\* et \*\*1 endurance\*\*/);
  assert.equal(race.flags,4096);assert.deepEqual(race.allowed_mentions,{parse:[]});
  assert.match(race.embeds[0].title,/6h de Spa/);assert.match(race.embeds[0].description,new RegExp(ANNOUNCE_HOOKS.endurance));
  assert.match(JSON.stringify(race.embeds[0].fields),/Équipage A[\s\S]*Pilote 1/);
  assert.match(JSON.stringify(race.embeds[0].fields),/1 présent/);
  assert.match(event.embeds[0].title,/Coupe GT3/);
  assert.match(event.embeds[0].description,new RegExp(`${ANNOUNCE_HOOKS.ams2} ${ANNOUNCE_HOOKS.open}`));
  assert.match(event.embeds[0].description,/La pluie attendue sur Spa/);
  assert.equal(event.embeds[0].thumbnail.url.endsWith('/images/event-access/open-ams2.png'),true);
  assert.deepEqual(event.components[0].components.map(button=>button.label),['Présent','Absent']);
  assert.equal(event.components[0].components[1].custom_id,`absent:${EVENT}`);
  // The next passes send nothing again.
  calls.length=0;
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+2*60000),false);
  assert.equal(sent(calls).length,0);
});

test('the count of présents is kept up to date; a setting made after 9h waits for the next morning',async t=>{
  const {DB,env,calls,messages,settings}=setup(t);
  await announceCommunity(env,TDZ,settings(),MORNING);
  DB.db.prepare(`INSERT INTO participants(id,name,user_id,created_by,created_at,community_id) VALUES('p2','Pilote 2',NULL,'111111111111111111',0,?)`).run(DEV_COMMUNITY);
  DB.db.prepare(`INSERT INTO registrations(id,event_id,departure_id,guest_hash,name,name_key,category,status,created_at,participant_id,community_id) VALUES('r2',?,'start-e1','g2','Pilote 2','pilote 2','GT3','whole',0,'p2',?)`).run(EVENT,DEV_COMMUNITY);
  calls.length=0;
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+11*60000),true);
  const edits=calls.filter(call=>call.method==='PATCH');
  assert.equal(edits.length,1,'only the event changed');
  assert.match(JSON.stringify(edits[0].body.embeds[0].fields),/1 présent\*\* · 19 places restantes/);
  assert.equal([...messages.values()].length,3);

  DB.db.prepare('DELETE FROM discord_announcements').run();calls.length=0;
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+2*HOUR),false);
  assert.equal(calls.length,0);
});

test('« Absent » from the announcement marks the pilot absent on the site',async t=>{
  const {DB,env,settings}=setup(t);
  await announceCommunity(env,TDZ,settings(),MORNING);
  const keys=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  env.DISCORD_PUBLIC_KEY=Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex');
  // The event is still to come.
  DB.db.prepare('UPDATE events SET departures=? WHERE id=?').run(JSON.stringify([{id:'start-e1',startsAt:Date.now()+HOUR}]),EVENT);
  const body=JSON.stringify({type:3,guild_id:GUILD,channel_id:ANNOUNCES,data:{custom_id:`absent:${EVENT}`},member:{roles:[],permissions:'0',user:{id:PILOT,username:'bob',global_name:'Bob'}}});
  const timestamp=String(Math.floor(Date.now()/1000)),signature=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(timestamp+body))).toString('hex');
  const response=await worker.fetch(new Request('https://site.example/discord/interactions',{method:'POST',body,headers:{'X-Signature-Ed25519':signature,'X-Signature-Timestamp':timestamp}}),env);
  assert.match((await response.json()).data.content,/tu es absent pour \*\*Coupe GT3\*\*/);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS n FROM event_absences WHERE event_id=? AND user_id=?').get(EVENT,PILOT).n,1);
});

test('hooks: the type, else the sim, then OPEN / SAFE (TDZ only); Gridfest has its own; the password never goes on Discord',()=>{
  assert.equal(eventHook({tdz:true,sim:'lmu',type:'Bouboule',access:'safe'}),`${ANNOUNCE_HOOKS.Bouboule} ${ANNOUNCE_HOOKS.safe}`);
  assert.equal(eventHook({tdz:true,sim:'iracing',type:'SAFE',access:'safe'}),`${ANNOUNCE_HOOKS.iracing} ${ANNOUNCE_HOOKS.safe}`);
  assert.equal(eventHook({tdz:true,sim:'lmu',type:'Gridfest',access:'open'}),ANNOUNCE_HOOKS.Gridfest);
  assert.equal(eventHook({tdz:false,sim:'ace',type:'',access:''}),ANNOUNCE_HOOKS.ace);
  const payload=buildAnnounceEvent({id:EVENT,name:'Soirée',sim:'lmu',type:'SAFE',access:'safe',tdz:true,startsAt:MORNING+12*HOUR,rounds:[{circuit:'spa',durationMinutes:40,categories:['GT3']}],capacity:null,entered:3,password:true},{url:'https://tdz.site.example'});
  assert.match(payload.embeds[0].description,/🔑 Mot de passe du serveur sur le site/);
  assert.doesNotMatch(JSON.stringify(payload),/secret/);
  assert.match(payload.embeds[0].description,/Ce soir 19h30/);
  const race=buildAnnounceRace({id:RACE,name:'4h du Mans',circuit:'le-mans',official:true,eventType:'special',durationMinutes:240,departures:[{eventId:RACE,startsAt:MORNING+10*HOUR,crews:[],unassignedPilots:[]}]},{url:'https://site.example'});
  assert.match(race.embeds[0].description,new RegExp(ANNOUNCE_HOOKS.official));
  assert.match(JSON.stringify(race.embeds[0].fields),/Aucun équipage pour l’instant : lance-toi !/);
});

test('the setting keeps the announcement channel, and refuses anything else',()=>{
  assert.equal(layoutInput({mode:'events',sims:'all',under:'top',announce:ANNOUNCES}).announce,ANNOUNCES);
  assert.equal(layoutInput({mode:'events',sims:'all',under:'top',announce:''}).announce,undefined);
  assert.throws(()=>layoutInput({mode:'events',sims:'all',under:'top',announce:'bot'}),/annonce du jour/);
});
