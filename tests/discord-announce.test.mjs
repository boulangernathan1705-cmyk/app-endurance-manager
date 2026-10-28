import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {announceCommunity} from '../server/discord-announce.mjs';
import {buildCompleteAnnouncement,buildAnnounceEvent,buildAnnounceIntro,buildAnnounceRace,eventHook,ANNOUNCE_HOOKS} from '../server/discord-weekly-format.mjs';
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
    details:{type:'OPEN',note:'La pluie attendue sur Spa.',streamTime:'20:45'}});
  event(RACE,'6h de Spa',Date.parse('2026-10-28T19:00:00Z'),{hours:6,minutes:360,details:{weather:'mixed'},type:'private'});
  event(TOMORROW,'4h de Monza',Date.parse('2026-10-29T19:00:00Z'),{hours:4,minutes:240,circuit:'monza'});
  DB.db.prepare(`INSERT INTO participants(id,name,user_id,created_by,created_at,community_id) VALUES('p1','Pilote 1',NULL,'111111111111111111',0,?)`).run(DEV_COMMUNITY);
  DB.db.prepare(`INSERT INTO registrations(id,event_id,departure_id,guest_hash,name,name_key,category,status,created_at,participant_id,community_id) VALUES('r1',?,'start-e2','g1','Pilote 1','pilote 1','GT3','whole',0,'p1',?)`).run(RACE,DEV_COMMUNITY);
  DB.db.prepare(`INSERT INTO crews(id,event_id,departure_id,name,category,car,created_at,community_id) VALUES('c1',?,'start-e2','Équipage A','GT3','Ferrari 296',0,?)`).run(RACE,DEV_COMMUNITY);
  DB.db.prepare(`INSERT INTO crew_members(registration_id,crew_id) VALUES('r1','c1')`).run();
  DB.db.prepare(`INSERT INTO community_recap_settings(community_id,enabled,mode,scope,guild_id,destination_id,destination_name,layout) VALUES(?,1,'events','all',?,'','',?)`)
    .run(DEV_COMMUNITY,GUILD,JSON.stringify({v:1,mode:'events',sims:'all',announce:ANNOUNCES,stream:'https://twitch.tv/tdz'}));
  const env={DB,APP_ORIGIN:'https://site.example',DISCORD_BOT_TOKEN:'fake',DISCORD_CLIENT_ID:'444444444444444444',DISCORD_PUBLIC_KEY:'a'.repeat(64)};
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const path=String(url).replace('https://discord.com/api/v10',''),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    calls.push({path,method,body});
    if(path.startsWith('/applications/'))return Response.json({items:[]});
    const send=path.match(/^\/channels\/(\d+)\/messages$/);
    if(send){const message={...body,id:String(counter++),channel_id:send[1]};messages.set(message.id,message);return Response.json(message);}
    const edit=path.match(/^\/channels\/(\d+)\/messages\/(\d+)$/);
    if(edit){if(method!=='DELETE'&&!messages.has(edit[2]))return Response.json({code:10008},{status:404});if(method==='DELETE'){messages.delete(edit[2]);return new Response(null,{status:204});}Object.assign(messages.get(edit[2]),body);return Response.json(messages.get(edit[2]));}
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
  assert.equal(posts.length,1,'one complete message for the day');
  assert.ok(posts.every(call=>call.path===`/channels/${ANNOUNCES}/messages`));
  const combined=posts[0].body,embed=combined.embeds[0],text=JSON.stringify(embed);
  assert.equal(combined.content,'@everyone');assert.deepEqual(combined.allowed_mentions,{parse:['everyone']});
  assert.equal(combined.embeds.length,1,'one visual frame, not several embeds');
  assert.match(embed.description,/\*\*1 event\*\* et \*\*1 endurance\*\*/);
  assert.match(embed.description,/20h45/);
  assert.match(text,/6h de Spa/);assert.match(text,/Coupe GT3/);
  assert.ok(text.indexOf('6h de Spa')<text.indexOf('Coupe GT3'));
  assert.match(text,/Équipage A/);assert.match(text,/Pilote 1/);assert.match(text,/1 présent/);
  assert.match(text,/La pluie attendue sur Spa/);assert.match(text,/Manche 1/);assert.match(text,/Manche 2/);
  assert.ok(embed.image);assert.ok(embed.fields.some(field=>field.name==='────────────'));
  assert.deepEqual(combined.components[1].components.map(button=>button.label),['Présent / S’inscrire · Coupe GT3','Absent · Coupe GT3']);
  assert.equal(combined.components[1].components[1].custom_id,`absent:${EVENT}`);
  // The next passes send nothing again.
  calls.length=0;
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+2*60000),false);
  assert.equal(sent(calls).length,0);
});

test('the count of présents is kept up to date; after 9h only the day it is turned on',async t=>{
  const {DB,env,calls,messages,settings}=setup(t);
  await announceCommunity(env,TDZ,settings(),MORNING);
  DB.db.prepare(`INSERT INTO participants(id,name,user_id,created_by,created_at,community_id) VALUES('p2','Pilote 2',NULL,'111111111111111111',0,?)`).run(DEV_COMMUNITY);
  DB.db.prepare(`INSERT INTO registrations(id,event_id,departure_id,guest_hash,name,name_key,category,status,created_at,participant_id,community_id) VALUES('r2',?,'start-e1','g2','Pilote 2','pilote 2','GT3','whole',0,'p2',?)`).run(EVENT,DEV_COMMUNITY);
  calls.length=0;
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+11*60000),true);
  const edits=calls.filter(call=>call.method==='PATCH');
  assert.equal(edits.length,1,'only the event changed');
  assert.match(JSON.stringify(edits[0].body.embeds),/1 présent\*\* · 19 places restantes/);
  assert.equal([...messages.values()].length,1);

  DB.db.prepare('DELETE FROM discord_announcements').run();calls.length=0;
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+2*HOUR),false);
  assert.equal(calls.length,0);
  // Turned on at 9h29: announced at once (the races left today).
  DB.db.prepare('UPDATE community_recap_settings SET layout=?').run(JSON.stringify({v:1,mode:'events',sims:'all',announce:ANNOUNCES,announceAt:MORNING+2*HOUR-60000}));
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+2*HOUR),true);
  assert.equal(sent(calls).length,1);
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
  assert.equal(eventHook({tdz:true,sim:'lmu',type:'Bouboule',access:'safe'}),`${ANNOUNCE_HOOKS.BOULOULES} ${ANNOUNCE_HOOKS.safe}`);
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

test('the community\'s stream in the intro, at the time given on the event; the Twitch of each Gridfest streamer',()=>{
  const site={url:'https://tdz.site.example',streamUrl:'https://www.twitch.tv/tdz'};
  const intro=counts=>buildAnnounceIntro({events:2,races:0,...counts},site).embeds[0].description;
  assert.match(intro({streams:[{name:'Soirée',time:'19:45'}]}),/📺 Lancement du stream sur \[Twitch\]\(https:\/\/www\.twitch\.tv\/tdz\) à 19h45/);
  assert.match(intro({streams:[{name:'B',time:'21:15'},{name:'A',time:'19:45'}]}),/à 19h45 \(A\), 21h15 \(B\)/);
  assert.match(intro({streams:[]}),/📺 Le stream en direct sur \[Twitch\]/);
  assert.doesNotMatch(buildAnnounceIntro({events:1,races:0,streams:[]},{url:site.url}).embeds[0].description,/📺/);
  const event=buildAnnounceEvent({id:EVENT,name:'Gridfest',sim:'lmu',type:'Gridfest',access:'open',tdz:true,startsAt:MORNING+12*HOUR,rounds:[],capacity:null,entered:1,
    streamers:[{name:'Zed',twitchUrl:'https://twitch.tv/zed',capacity:5,entered:1},{name:'Ana',twitchUrl:'',capacity:5,entered:0}]},site);
  assert.doesNotMatch(JSON.stringify(event.components),/Stream/);
  assert.match(event.embeds[0].description,/🎙️ \[Zed\]\(https:\/\/twitch\.tv\/zed\)/);
  assert.match(event.embeds[0].description,/🎙️ Ana ·/);
  assert.equal(layoutInput({mode:'events',sims:'all',under:'top',announce:ANNOUNCES,stream:' https://twitch.tv/tdz '}).stream,'https://twitch.tv/tdz');
  assert.equal(layoutInput({mode:'events',sims:'all',under:'top',announce:'',stream:'https://twitch.tv/tdz'}).stream,undefined);
  assert.throws(()=>layoutInput({mode:'events',sims:'all',under:'top',announce:ANNOUNCES,stream:'twitch.tv/tdz'}),/stream/);
});


test('an existing multi-message day is consolidated silently into the original intro',async t=>{
  const {DB,env,calls,messages,settings}=setup(t);
  await announceCommunity(env,TDZ,settings(),MORNING);
  const intro=sent(calls)[0].body;
  messages.set('888888888888888888',{id:'888888888888888888',content:'old separate race'});
  DB.db.prepare("UPDATE discord_announcements SET message_id='888888888888888888' WHERE item=?").run(RACE);
  calls.length=0;
  await announceCommunity(env,TDZ,settings(),MORNING+60000);
  assert.equal(sent(calls).length,0,'reuses the original message');
  assert.ok(calls.some(call=>call.method==='DELETE'&&call.path.endsWith('/888888888888888888')));
  const edit=calls.find(call=>call.method==='PATCH');
  assert.deepEqual(edit.body.allowed_mentions,{parse:[]},'migration does not ping everyone again');
  assert.equal(messages.size,1);
  assert.equal(new Set(DB.db.prepare('SELECT message_id FROM discord_announcements').all().map(row=>row.message_id)).size,1);
});

test('large daily announcements respect Discord embed, character and component limits',()=>{
  const intro=buildAnnounceIntro({events:12},{name:'TDZ',url:'https://site.example'});
  const items=Array.from({length:12},(_,index)=>({name:`Event ${index}`,payload:buildAnnounceEvent({id:String(index),name:`Event ${index}`,sim:'lmu',tdz:true,type:'BOULOULES',access:'open',startsAt:MORNING+HOUR,rounds:[],entered:0,note:'Long note '.repeat(80)},{url:'https://site.example'})}));
  const payload=buildCompleteAnnouncement(intro,items,{url:'https://site.example',bannerUrl:'https://site.example/banner.webp'});
  assert.equal(payload.embeds.length,1);assert.ok(payload.embeds[0].fields.length<=25);
  assert.ok(payload.components.length<=5);
  assert.equal(payload.embeds.filter(embed=>embed.image).length,1);
  assert.match(JSON.stringify(payload.embeds[0].fields),/3 autres rendez-vous/);
  const chars=payload.embeds.reduce((sum,embed)=>sum+[embed.title,embed.description,embed.author?.name,embed.footer?.text,...(embed.fields||[]).flatMap(field=>[field.name,field.value])].reduce((total,value)=>total+String(value||'').length,0),0);
  assert.ok(chars<=6000);
});


test('a stream-only announcement has no invitation to register or absence buttons',()=>{
  const intro=buildAnnounceIntro({events:0,races:0,lives:1},{url:'https://site.example'});
  const payload=buildCompleteAnnouncement(intro,[{name:'Live',payload:{embeds:[{title:'Live',description:'Twitch'}],components:[]}}],{url:'https://site.example'});
  assert.match(payload.embeds[0].title,/stream/);
  assert.doesNotMatch(payload.embeds[0].description,/Inscris-toi/);
  assert.deepEqual(payload.components,[]);
});


test('a missing original intro is replaced before legacy cards are deleted, without pinging again',async t=>{
  const {DB,env,calls,messages,settings}=setup(t);
  await announceCommunity(env,TDZ,settings(),MORNING);
  messages.clear();
  messages.set('888888888888888888',{id:'888888888888888888',content:'old race'});
  DB.db.prepare("UPDATE discord_announcements SET message_id='888888888888888888' WHERE item=?").run(RACE);
  calls.length=0;
  await announceCommunity(env,TDZ,settings(),MORNING+60000);
  const replacement=sent(calls)[0];
  assert.ok(replacement);
  assert.deepEqual(replacement.body.allowed_mentions,{parse:[]});
  assert.equal(replacement.body.flags,4096);
  assert.ok(calls.indexOf(replacement)<calls.findIndex(call=>call.method==='DELETE'));
  assert.ok(messages.has(DB.db.prepare("SELECT message_id FROM discord_announcements WHERE item='intro'").get().message_id));
  assert.equal(messages.size,1);
});

test('an unchanged announcement deleted from Discord is recovered on the next refresh',async t=>{
  const {env,calls,messages,settings}=setup(t);
  await announceCommunity(env,TDZ,settings(),MORNING);
  messages.clear();calls.length=0;
  await announceCommunity(env,TDZ,settings(),MORNING+11*60000);
  assert.equal(sent(calls).length,1);
  assert.equal(messages.size,1);
  assert.deepEqual(sent(calls)[0].body.allowed_mentions,{parse:[]});
});

test('a failed replacement preserves legacy cards and retries on the following pass',async t=>{
  const {DB,env,calls,messages,settings}=setup(t);
  await announceCommunity(env,TDZ,settings(),MORNING);
  messages.clear();messages.set('888888888888888888',{id:'888888888888888888',content:'old race'});
  DB.db.prepare("UPDATE discord_announcements SET message_id='888888888888888888' WHERE item=?").run(RACE);
  const fetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>options?.method==='POST'?Response.json({code:50013},{status:403}):fetch(url,options);
  calls.length=0;
  await assert.rejects(announceCommunity(env,TDZ,settings(),MORNING+60000));
  assert.equal(calls.filter(call=>call.method==='DELETE').length,0);
  assert.ok(messages.has('888888888888888888'));
  globalThis.fetch=fetch;
  await announceCommunity(env,TDZ,settings(),MORNING+120000);
  assert.equal(messages.size,1);
  assert.ok(!messages.has('888888888888888888'));
});
