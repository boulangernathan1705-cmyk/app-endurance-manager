import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {announceCommunity,announceItems,parisDayStart} from '../server/discord-announce.mjs';
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
  DB.db.prepare(`INSERT INTO registrations(id,event_id,departure_id,guest_hash,name,name_key,category,status,created_at,participant_id,community_id) VALUES('r-event',?,'start-e1','g1','Pilote 1','pilote 1','GT3','whole',0,'p1',?)`).run(EVENT,DEV_COMMUNITY);
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
    const send=path.split('?')[0].match(/^\/channels\/(\d+)\/messages$/);
    if(send&&method==='GET')return Response.json([...messages.values()].filter(message=>message.channel_id===send[1]).slice(-100).reverse());
    if(send){const message={...body,id:String(counter++),channel_id:send[1],author:{id:env.DISCORD_CLIENT_ID,bot:true}};messages.set(message.id,message);return Response.json(message);}
    const edit=path.match(/^\/channels\/(\d+)\/messages\/(\d+)$/);
    if(edit){if(method!=='DELETE'&&!messages.has(edit[2]))return Response.json({code:10008},{status:404});if(method==='DELETE'){messages.delete(edit[2]);return new Response(null,{status:204});}Object.assign(messages.get(edit[2]),body);return Response.json(messages.get(edit[2]));}
    return new Response('{}',{status:404});
  };
  t.after(()=>globalThis.fetch=original);
  const settings=()=>DB.db.prepare('SELECT * FROM community_recap_settings WHERE community_id=?').get(DEV_COMMUNITY);
  return {DB,env,calls,messages,settings};
}
const sent=calls=>calls.filter(call=>call.method==='POST'&&call.path.startsWith('/channels/'));

test('at 7h30 the stream comes first with @everyone and the race it streams, then the other races without a ping',async t=>{
  const {env,calls,settings}=setup(t);
  // Before 7h30: nothing.
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING-2*60000),false);
  assert.equal(calls.length,0);
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING),true);
  const posts=sent(calls);
  assert.equal(posts.length,2,'the stream, then the races');
  assert.ok(posts.every(call=>call.path===`/channels/${ANNOUNCES}/messages`));
  // 1. The stream, with the event it streams (Coupe GT3, stream time 20h45): the only ping.
  const live=posts[0].body,embed=live.embeds[0],text=JSON.stringify(embed);
  assert.equal(live.content,'@everyone');assert.deepEqual(live.allowed_mentions,{parse:['everyone']});
  assert.equal(live.embeds.length,1,'one visual frame, not several embeds');
  assert.doesNotMatch(text,/Aujourd’hui sur le serveur|C’est jour de course|Inscris-toi, préviens/);
  assert.match(embed.title,/Coupe GT3/);assert.doesNotMatch(text,/6h de Spa/);
  assert.equal(embed.fields.at(-1).name,'📺 LA SOIRÉE AVEC TDZ');
  assert.match(embed.fields.at(-1).value,/Début du stream à \*\*20h45\*\*/);
  assert.match(embed.fields.at(-1).value,/\*\*\[▶ REJOINDRE LE STREAM\].*https:\/\/twitch.tv\/tdz/);
  assert.match(text,/La pluie attendue sur Spa/);assert.match(text,/Manche 1/);assert.match(text,/Manche 2/);assert.match(text,/1 présent/);
  assert.ok(embed.image,'the banner goes with the stream');
  assert.deepEqual(live.components[0].components.map(button=>button.label),['S’inscrire','Absent']);
  assert.equal(live.components[0].components[1].custom_id,`absent:${EVENT}`);
  // 2. The other races: no ping, no stream block, no banner, the time in words.
  const races=posts[1].body,other=JSON.stringify(races.embeds[0]);
  assert.equal(races.content,'**Aussi aujourd’hui sur le serveur :**');
  assert.deepEqual(races.allowed_mentions,{parse:[]});assert.equal(races.flags,4096);
  assert.match(races.embeds[0].title,/6h de Spa/);assert.doesNotMatch(other,/Coupe GT3|REJOINDRE LE STREAM/);
  assert.match(other,/Équipage A/);assert.match(other,/Pilote 1/);assert.match(other,/Ce soir 20h00/);assert.doesNotMatch(other,/<t:/);
  assert.ok(!races.embeds[0].image);
  // The next passes send nothing again.
  calls.length=0;
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+2*60000),false);
  assert.equal(sent(calls).length,0);
});

test('a day without a stream: one message for the races, without a ping (Nathan, 2026-11-01)',async t=>{
  const {DB,env,calls,settings}=setup(t);
  DB.db.prepare("UPDATE events SET details=json_remove(details,'$.streamTime') WHERE id=?").run(EVENT);
  await announceCommunity(env,TDZ,settings(),MORNING);
  const posts=sent(calls);
  assert.equal(posts.length,1);
  assert.equal(posts[0].body.content,'');assert.deepEqual(posts[0].body.allowed_mentions,{parse:[]});assert.equal(posts[0].body.flags,4096);
  const text=JSON.stringify(posts[0].body.embeds[0]);
  assert.match(text,/6h de Spa/);assert.match(text,/Coupe GT3/);assert.ok(text.indexOf('6h de Spa')<text.indexOf('Coupe GT3'));
  assert.doesNotMatch(text,/REJOINDRE LE STREAM/);assert.ok(posts[0].body.embeds[0].image,'the banner when the races are alone');
  // A stream time added later the same morning sends the stream's message, without a ping: the morning's chance is gone.
  DB.db.prepare("UPDATE events SET details=json_set(details,'$.streamTime','20:45') WHERE id=?").run(EVENT);calls.length=0;
  await announceCommunity(env,TDZ,settings(),MORNING+11*60000);
  assert.equal(sent(calls).length,1);assert.deepEqual(sent(calls)[0].body.allowed_mentions,{parse:[]});
  assert.match(JSON.stringify(sent(calls)[0].body.embeds[0]),/Coupe GT3/);
});

test('counts refresh silently; first publication after 9h and late activation are silent',async t=>{
  const {DB,env,calls,messages,settings}=setup(t);
  await announceCommunity(env,TDZ,settings(),MORNING);
  DB.db.prepare(`INSERT INTO participants(id,name,user_id,created_by,created_at,community_id) VALUES('p2','Pilote 2',NULL,'111111111111111111',0,?)`).run(DEV_COMMUNITY);
  DB.db.prepare(`INSERT INTO registrations(id,event_id,departure_id,guest_hash,name,name_key,category,status,created_at,participant_id,community_id) VALUES('r2',?,'start-e1','g2','Pilote 2','pilote 2','GT3','whole',0,'p2',?)`).run(EVENT,DEV_COMMUNITY);
  calls.length=0;
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+11*60000),true);
  const edits=calls.filter(call=>call.method==='PATCH');
  assert.equal(edits.length,1,'only the event changed');
  assert.match(JSON.stringify(edits[0].body.embeds),/2 présents\*\* · 18 places restantes/);
  assert.equal([...messages.values()].length,2,'the stream and the races');

  DB.db.prepare('DELETE FROM discord_announcements').run();calls.length=0;
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+2*HOUR),true);
  assert.deepEqual(sent(calls)[0].body.allowed_mentions,{parse:[]});
  assert.equal(sent(calls)[0].body.flags,4096);
  DB.db.prepare('DELETE FROM discord_announcements').run();calls.length=0;
  // Turned on at 9h29: announced at once (the races left today).
  DB.db.prepare('UPDATE community_recap_settings SET layout=?').run(JSON.stringify({v:1,mode:'events',sims:'all',announce:ANNOUNCES,announceAt:MORNING+2*HOUR-60000}));
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+2*HOUR),true);
  assert.equal(sent(calls).length,1);
  assert.deepEqual(sent(calls)[0].body.allowed_mentions,{parse:[]});
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
  assert.match(JSON.stringify(payload.embeds[0].fields),/🔑 Mot de passe disponible sur la fiche/);
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
  // No stream time today: the streamer neither streams nor races, no stream line.
  assert.doesNotMatch(intro({streams:[]}),/📺/);
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
  assert.ok(!calls.some(call=>JSON.stringify(call.body?.allowed_mentions||{}).includes('everyone')),'no ping again');
  assert.equal(messages.size,2,'the stream and the races');
  assert.equal(new Set(DB.db.prepare('SELECT message_id FROM discord_announcements').all().map(row=>row.message_id)).size,2);
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
  assert.equal(payload.embeds[0].title,'Live');
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
  assert.equal(messages.size,2);
});

test('an unchanged announcement deleted from Discord is recovered on the next refresh',async t=>{
  const {env,calls,messages,settings}=setup(t);
  await announceCommunity(env,TDZ,settings(),MORNING);
  messages.clear();calls.length=0;
  await announceCommunity(env,TDZ,settings(),MORNING+11*60000);
  assert.equal(sent(calls).length,2);
  assert.equal(messages.size,2);
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
  assert.equal(messages.size,2);
  assert.ok(!messages.has('888888888888888888'));
});


test('rounds have distinct readable sections and full session labels inside a single frame',()=>{
  const event=buildAnnounceEvent({id:EVENT,name:'SAFE race',sim:'ams2',tdz:true,type:'SAFE',access:'safe',startsAt:MORNING+HOUR,entered:12,rounds:[{circuit:'Velo Città',category:'GT4',car:'Ginetta G55',practice:10,qualifying:10,durationMinutes:20},{circuit:'Velo Città',category:'GT4',practice:5,qualifying:10,durationMinutes:40}]},{url:'https://site.example'});
  const payload=buildCompleteAnnouncement(buildAnnounceIntro({events:1,races:0}),[{name:'SAFE race',payload:event}],{});
  const embed=payload.embeds[0];
  assert.equal(payload.embeds.length,1);
  assert.ok(embed.fields.some(field=>field.name.startsWith('Manche 1')));
  assert.ok(embed.fields.some(field=>field.name.startsWith('Manche 2')));
  assert.ok(embed.fields.some(field=>/12 présents/.test(field.value)));
  assert.match(JSON.stringify(embed),/Essais : 10 min/);
  assert.match(JSON.stringify(embed),/Qualifications : 10 min/);
  assert.match(JSON.stringify(embed),/Course : 40 min/);
});

test('live block uses configured streamer name, and only on a day with a stream time',()=>{
  const intro=buildAnnounceIntro({events:1,streams:[{name:'A',time:'20:45'}]},{streamUrl:'https://twitch.tv/test'});
  const payload=buildCompleteAnnouncement(intro,[],{streamName:'La Praline'});
  assert.equal(payload.embeds[0].fields.at(-1).name,'📺 LA SOIRÉE AVEC LA PRALINE');
  // Races of other crews, no stream planned: the day is announced, without the stream.
  const quiet=buildCompleteAnnouncement(buildAnnounceIntro({races:2,streams:[]},{streamUrl:'https://twitch.tv/test'}),[],{streamName:'La Praline'});
  assert.ok(!quiet.embeds[0].fields.some(field=>/SOIRÉE/.test(field.name)));
});
test('all simulator events share identical facts and retain differences per round',()=>{
  for(const sim of ['lmu','iracing','ams2','ace'])for(const type of ['SAFE','BOULOULES','TONDEUZ TRAINING','Gridfest']){
    const base={circuit:'Velo Città',category:'GT4',car:'Ginetta G55',weather:'random',fuel:1,tyres:1,practice:10,qualifying:10,durationMinutes:20};
    const event={id:EVENT,name:'Race',sim,type,tdz:true,access:'safe',startsAt:MORNING,entered:0,rounds:[base,{...base,durationMinutes:40}]};
    const shared=buildAnnounceEvent(event).embeds[0];
    assert.match(shared.fields[0].value,/Velo Città/);
    assert.match(shared.fields[0].value,/Ginetta G55/);
    assert.doesNotMatch(shared.fields.find(field=>field.name.startsWith('Manche 1')).value,/Velo Città|Ginetta G55/);
    event.rounds[1]={...base,circuit:'Interlagos',car:'Porsche',weather:'rain',fuel:2};
    const mixed=buildAnnounceEvent(event).embeds[0];
    assert.doesNotMatch(mixed.description,/Velo Città|Interlagos|Ginetta G55|Porsche/);
    assert.match(mixed.fields.find(field=>field.name.startsWith('Manche 1')).value,/Velo Città/);
    assert.match(mixed.fields.find(field=>field.name.startsWith('Manche 2')).value,/Interlagos/);
    assert.match(mixed.fields.find(field=>field.name.startsWith('Manche 2')).value,/Porsche/);
    assert.match(mixed.fields[0].value,/GT4/);
  }
});


test('no entrants: no morning message or ping, even with an empty crew and repeated runs',async t=>{
  const {DB,env,calls,settings}=setup(t);
  DB.db.prepare('DELETE FROM crew_members').run();
  DB.db.prepare('DELETE FROM registrations').run();
  assert.deepEqual(await announceItems(env,TDZ,MORNING),[]);
  for(const offset of [0,2,12,30])assert.equal(await announceCommunity(env,TDZ,settings(),MORNING+offset*60000),false);
  assert.equal(calls.length,0);
});

test('official races with no local entrant and unavailable or other-departure entries are excluded',async t=>{
  const {DB,env,calls,settings}=setup(t);
  DB.db.prepare('DELETE FROM crew_members').run();
  DB.db.prepare("UPDATE events SET community_id='official' WHERE id=?").run(RACE);
  DB.db.prepare("UPDATE registrations SET status='unavailable' WHERE event_id=?").run(RACE);
  DB.db.prepare("UPDATE registrations SET departure_id='another-start' WHERE event_id=?").run(EVENT);
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING),false);
  assert.equal(sent(calls).length,0);
});

test('only races with entrants are included in a mixed day',async t=>{
  const {DB,env,calls,settings}=setup(t);
  DB.db.prepare('DELETE FROM registrations WHERE event_id=?').run(EVENT);
  await announceCommunity(env,TDZ,settings(),MORNING);
  const body=JSON.stringify(sent(calls)[0].body);
  assert.match(body,/6h de Spa/);
  assert.doesNotMatch(body,/Coupe GT3|20h45/);
});

test('two concurrent passes publish the day only once and release their lock',async t=>{
  const {DB,env,calls,settings}=setup(t);
  const results=await Promise.all([announceCommunity(env,TDZ,settings(),MORNING),announceCommunity(env,TDZ,settings(),MORNING)]);
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(sent(calls).length,2,'the stream and the races, once');
  assert.equal(settings().lock_until,0);
  assert.equal(DB.db.prepare("SELECT COUNT(DISTINCT message_id) AS n FROM discord_announcements").get().n,2);
});

test('a previously planned empty day is neither sent nor recreated after cancellations',async t=>{
  const {DB,env,calls,messages,settings}=setup(t);
  await announceCommunity(env,TDZ,settings(),MORNING);
  DB.db.prepare('DELETE FROM crew_members').run();
  DB.db.prepare('DELETE FROM registrations').run();
  messages.clear();calls.length=0;
  await announceCommunity(env,TDZ,settings(),MORNING+12*60000);
  assert.ok(calls.some(call=>call.method==='DELETE'));
  assert.equal(sent(calls).length,0);
  calls.length=0;
  DB.db.prepare('UPDATE discord_announcements SET message_id=NULL').run();
  await announceCommunity(env,TDZ,settings(),MORNING+24*60000);
  assert.equal(calls.length,0);
});

test('an explicit stream announcement still works without registrations',async t=>{
  const {DB,env,calls,settings}=setup(t);
  DB.db.prepare('DELETE FROM crew_members').run();
  DB.db.prepare('DELETE FROM registrations').run();
  DB.db.prepare("UPDATE events SET sim='stream',details='{}' WHERE id=?").run(EVENT);
  await announceCommunity(env,TDZ,settings(),MORNING);
  assert.equal(sent(calls).length,1);
  assert.deepEqual(sent(calls)[0].body.components,[]);
  // The announcement is first of all for the stream (Nathan, 2026-11-01): a stream alone pings @everyone.
  assert.deepEqual(sent(calls)[0].body.allowed_mentions,{parse:['everyone']});
});

test('entries from another community never trigger this community’s announcement',async t=>{
  const {DB,env,calls,settings}=setup(t);
  DB.db.prepare('DELETE FROM crew_members').run();
  DB.db.prepare("INSERT INTO communities(id,slug,name,short_name,created_at) VALUES('other','other','Other','OTHER',0)").run();
  DB.db.prepare("INSERT INTO participants(id,name,created_by,created_at,community_id) VALUES('other-p','Other pilot','111111111111111111',0,'other')").run();
  DB.db.prepare("UPDATE events SET community_id='official'").run();
  DB.db.prepare(`INSERT INTO registrations(id,event_id,departure_id,guest_hash,name,name_key,category,status,created_at,participant_id,community_id)
    SELECT 'other-'||id,event_id,departure_id,'other-'||guest_hash,name,'other-'||name_key,category,status,created_at,'other-p','other' FROM registrations`).run();
  DB.db.prepare('DELETE FROM registrations WHERE community_id=?').run(DEV_COMMUNITY);
  assert.equal(await announceCommunity(env,TDZ,settings(),MORNING),false);
  assert.equal(sent(calls).length,0);
});

test('a solo event selects today’s registered departure rather than an earlier empty one',async t=>{
  const {DB,env,calls,settings}=setup(t);
  DB.db.prepare('UPDATE events SET departures=? WHERE id=?').run(JSON.stringify([
    {id:'empty-start',startsAt:MORNING+HOUR},{id:'start-e1',startsAt:MORNING+2*HOUR}
  ]),EVENT);
  await announceCommunity(env,TDZ,settings(),MORNING);
  const body=JSON.stringify(sent(calls)[0].body);
  assert.match(body,/Coupe GT3/);
  assert.match(body,/9h30/);
  assert.doesNotMatch(body,/8h30/);
});


const clearEntries=DB=>{DB.db.prepare('DELETE FROM crew_members').run();DB.db.prepare('DELETE FROM registrations').run();};
const lateEntry=DB=>DB.db.prepare(`INSERT INTO registrations(id,event_id,departure_id,guest_hash,name,name_key,category,status,created_at,participant_id,community_id)
 VALUES('late',?,'start-e1','late','Pilote 1','late','GT3','whole',0,'p1',?)`).run(EVENT,DEV_COMMUNITY);

test('a late first entrant creates a silent announcement after an empty morning',async t=>{
 const {DB,env,calls,settings}=setup(t);clearEntries(DB);
 await announceCommunity(env,TDZ,settings(),MORNING);lateEntry(DB);
 await announceCommunity(env,TDZ,settings(),MORNING+12*60000);
 assert.equal(sent(calls).length,1);assert.deepEqual(sent(calls)[0].body.allowed_mentions,{parse:[]});assert.equal(sent(calls)[0].body.flags,4096);
 assert.match(JSON.stringify(sent(calls)[0].body),/Coupe GT3/);
});

test('a newly entered race is added without another ping',async t=>{
 const {DB,env,calls,messages,settings}=setup(t);DB.db.prepare("UPDATE events SET details=json_remove(details,'$.streamTime') WHERE id=?").run(EVENT);
 DB.db.prepare('DELETE FROM registrations WHERE event_id=?').run(EVENT);
 await announceCommunity(env,TDZ,settings(),MORNING);lateEntry(DB);calls.length=0;
 await announceCommunity(env,TDZ,settings(),MORNING+12*60000);
 assert.equal(sent(calls).length,0);assert.equal(messages.size,1);
 assert.match(JSON.stringify([...messages.values()]),/Coupe GT3/);
 assert.deepEqual(calls.find(call=>call.method==='PATCH').body.allowed_mentions,{parse:[]});
 // The streamed race entered after the morning: its stream message comes without a ping.
 DB.db.prepare("UPDATE events SET details=json_set(details,'$.streamTime','20:45') WHERE id=?").run(EVENT);calls.length=0;
 await announceCommunity(env,TDZ,settings(),MORNING+24*60000);
 assert.equal(sent(calls).length,1);assert.deepEqual(sent(calls)[0].body.allowed_mentions,{parse:[]});assert.equal(sent(calls)[0].body.flags,4096);
});

test('last cancellation removes the stale message; a later return never pings again',async t=>{
 const {DB,env,calls,messages,settings}=setup(t);await announceCommunity(env,TDZ,settings(),MORNING);clearEntries(DB);calls.length=0;
 await announceCommunity(env,TDZ,settings(),MORNING+12*60000);
 assert.equal(messages.size,0);assert.equal(calls.filter(call=>call.method==='DELETE').length,2);
 lateEntry(DB);calls.length=0;await announceCommunity(env,TDZ,settings(),MORNING+24*60000);
 assert.equal(messages.size,1);assert.deepEqual(sent(calls)[0].body.allowed_mentions,{parse:[]});assert.equal(sent(calls)[0].body.flags,4096);
});

test('an accepted initial POST with a lost response is recovered without a second POST',async t=>{
 const {DB,env,calls,messages,settings}=setup(t),fetch=globalThis.fetch;let lose=true;
 globalThis.fetch=async(url,options)=>{
   if(options?.method==='POST'&&String(url).endsWith('/messages')){
     const row=DB.db.prepare("SELECT * FROM discord_announcements WHERE pending_nonce<>''").get();assert.equal(row.ping_attempted,1);assert.ok(row.pending_nonce);
     const response=await fetch(url,options);if(lose){lose=false;throw new Error('Response lost');}return response;
   }return fetch(url,options);
 };
 await assert.rejects(announceCommunity(env,TDZ,settings(),MORNING),/Response lost/);
 await announceCommunity(env,TDZ,settings(),MORNING+12*60000);
 assert.equal(messages.size,2);assert.equal(sent(calls).length,2,'the stream once, then the races');
 assert.equal(DB.db.prepare("SELECT pending_nonce FROM discord_announcements WHERE item='intro'").get().pending_nonce,'');
});

test('a failed DB save after successful publication recovers the message before retrying',async t=>{
 const {DB,env,calls,messages,settings}=setup(t),prepare=DB.prepare.bind(DB);let fail=true;
 DB.prepare=sql=>{const stmt=prepare(sql);if(sql.startsWith('UPDATE discord_announcements SET message_id=?,channel_id=?,content_hash=?,checked_at=')){
  const run=stmt.run.bind(stmt);stmt.run=async()=>{if(fail){fail=false;throw new Error('DB save failed');}return run();};}return stmt;};
 await assert.rejects(announceCommunity(env,TDZ,settings(),MORNING),/DB save failed/);
 await announceCommunity(env,TDZ,settings(),MORNING+12*60000);
 assert.equal(sent(calls).length,2);assert.equal(messages.size,2);
 assert.ok(DB.db.prepare("SELECT message_id FROM discord_announcements WHERE item='intro'").get().message_id);
});

test('when no accepted message is found, retrying the reserved nonce is silent',async t=>{
 const {DB,env,calls,settings}=setup(t),fetch=globalThis.fetch;let fail=true;
 globalThis.fetch=(url,options)=>{if(fail&&options?.method==='POST'&&String(url).endsWith('/messages')){fail=false;return Promise.reject(new Error('Send failed'));}return fetch(url,options);};
 await assert.rejects(announceCommunity(env,TDZ,settings(),MORNING),/Send failed/);
 const nonce=DB.db.prepare("SELECT pending_nonce FROM discord_announcements WHERE item='intro'").get().pending_nonce;
 await announceCommunity(env,TDZ,settings(),MORNING+12*60000);
 assert.equal(sent(calls).length,2);assert.equal(sent(calls)[0].body.nonce,nonce);
 assert.deepEqual(sent(calls)[0].body.allowed_mentions,{parse:[]});assert.equal(sent(calls)[0].body.flags,4096);
});

test('an unreadable recovery history fails closed without a second send',async t=>{
 const {env,calls,settings}=setup(t),fetch=globalThis.fetch;let lose=true;
 globalThis.fetch=async(url,options)=>{const response=await fetch(url,options);if(lose&&options?.method==='POST'&&String(url).endsWith('/messages')){lose=false;throw new Error('Response lost');}return response;};
 await assert.rejects(announceCommunity(env,TDZ,settings(),MORNING));
 globalThis.fetch=(url,options)=>String(url).includes('messages?limit=100')?Promise.resolve(Response.json({code:50013},{status:403})):fetch(url,options);
 await assert.rejects(announceCommunity(env,TDZ,settings(),MORNING+12*60000));assert.equal(sent(calls).length,1);
});

test('moving the announcement channel replaces it silently and cleans the old location',async t=>{
 const {DB,env,calls,messages,settings}=setup(t);await announceCommunity(env,TDZ,settings(),MORNING);
 const layout=JSON.parse(settings().layout);layout.announce='666666666666666666';DB.db.prepare('UPDATE community_recap_settings SET layout=?').run(JSON.stringify(layout));calls.length=0;
 await announceCommunity(env,TDZ,settings(),MORNING+60000);
 assert.equal(sent(calls)[0].path,'/channels/666666666666666666/messages');assert.equal(messages.size,2);
 assert.deepEqual(sent(calls)[0].body.allowed_mentions,{parse:[]});assert.equal(sent(calls)[0].body.flags,4096);
 assert.ok(calls.some(call=>call.method==='DELETE'&&call.path.startsWith(`/channels/${ANNOUNCES}/`)));
});

test('the delivery migration marks existing days as already attempted',()=>{
 const db=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')&&!file.startsWith('0089')).sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 db.prepare(`INSERT INTO discord_announcements(community_id,day,item,kind,position,guild_id,channel_id,created_at) VALUES(?,'2026-10-28','intro','intro',0,?,?,0)`).run(DEV_COMMUNITY,GUILD,ANNOUNCES);
 db.exec(readFileSync(new URL('../migrations/0089_discord_announcement_delivery.sql',import.meta.url),'utf8'));
 const row=db.prepare('SELECT * FROM discord_announcements').get();assert.equal(row.ping_attempted,1);assert.equal(row.pending_nonce,'');db.close();
});

test('the day\'s announcement keeps every start of the day, started or not, until midnight',async t=>{
  const {env,messages,settings}=setup(t);
  await announceCommunity(env,TDZ,settings(),MORNING);
  // 23h30 Paris (22h30 UTC): the 6h de Spa (21h Paris) and the event (22h Paris) have started; the message stays whole.
  await announceCommunity(env,TDZ,settings(),Date.parse('2026-10-28T22:30:00Z'));
  assert.equal(messages.size,2);
  const text=JSON.stringify([...messages.values()]);
  assert.match(text,/6h de Spa/);assert.match(text,/Coupe GT3/);assert.doesNotMatch(text,/4h de Monza/);
});

test('the morning of a summer-time change still starts the day at midnight (Paris)',()=>{
  assert.equal(new Date(parisDayStart(Date.parse('2026-10-25T10:00:00Z'))+1).toISOString(),'2026-10-24T22:00:00.000Z');
  assert.equal(new Date(parisDayStart(Date.parse('2026-10-26T10:00:00Z'))+1).toISOString(),'2026-10-25T23:00:00.000Z');
  assert.equal(new Date(parisDayStart(Date.parse('2026-03-29T10:00:00Z'))+1).toISOString(),'2026-03-28T23:00:00.000Z');
});

test('the hooks by simulator never say « ce soir » (a race may start at 14h)', async () => {
  const {ANNOUNCE_HOOKS} = await import('../server/discord-weekly-format.mjs');
  for (const [key, text] of Object.entries(ANNOUNCE_HOOKS)) assert.doesNotMatch(text, /ce soir/i, key);
});
