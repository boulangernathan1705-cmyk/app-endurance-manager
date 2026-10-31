import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import scheduledWorker from '../server/worker-with-migrations.mjs';
import {syncCrewDiscord, closeDeletedCrewDiscord, cleanupOrphanCrewDiscord, CLOSE_AFTER, KEEP_ARCHIVES} from '../server/crew-discord.mjs';
import {linkTestServer, allowCrews, setMember, ORGA_ROLE, GUILD} from './fixtures/discord-server.mjs';

// Crews on Discord and race reminders (migrations 0044, 0045): the bot is a fake Discord that records each request.
const ROOT='https://site.example';
const ADMIN='111111111111111111', PILOT='222222222222222222', MATE='333333333333333333';
const DEV='e0a1c0de-0000-4000-8000-000000000001';
const BOT_ROLE='900000000000000009';
const HOUR=3600_000;
// Voices open from the Monday (Paris) of the race's week: the tests run on the Monday of the 6h SPA's week
// (Sunday 15 October 2090), the clock standing still unless a test gives its own time.
const RACE_MONDAY=Date.parse('2090-10-09T08:00:00Z');
mock.timers.enable({apis:['Date'],now:RACE_MONDAY});
const BOT_ACCESS=[{id:'app-id',type:1,allow:'1117200',deny:'0'},{id:GUILD,type:0,allow:'2080965379087937',deny:'0'}];
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();

class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}

// Fake Discord: every request is kept; new channels, threads and messages get new ids.
function fakeDiscord(){
  const calls=[];const state={botRights:true,channels:[{id:'500000000000000002',name:'Courses',type:4,position:2},{id:'500000000000000003',name:'général',type:0,position:0},{id:'500000000000000001',name:'Accueil',type:4,position:1}]};let next=700000000000000000n;const voiceStates=new Map();const gone=new Set();const unknownChannel=new Set();
  const reply=(status,data)=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  async function handler(url,init={}){
    const path=String(url).replace('https://discord.com/api/v10','');const method=init.method||'GET';
    const body=init.body?JSON.parse(init.body):null;calls.push({method,path,body});
    if(method==='DELETE'&&state.deleteStatus)return reply(state.deleteStatus,{code:50013});
    if(unknownChannel.has(path))return reply(404,{code:10003});
    if(gone.has(path))return reply(404,{code:10008});
    if(method==='GET'&&path===`/guilds/${GUILD}/members/app-id`)return state.botAbsent?reply(404,{code:10007}):reply(200,{roles:[BOT_ROLE]});
    if(method==='GET'&&path===`/guilds/${GUILD}`)return reply(200,{id:GUILD,name:'Test',owner_id:ADMIN});
    if(method==='GET'&&path===`/guilds/${GUILD}/channels`)return reply(200,state.channels || [{id:'500000000000000002',name:'Courses',type:4,position:2},{id:'500000000000000003',name:'général',type:0,position:0},{id:'500000000000000001',name:'Accueil',type:4,position:1}]);
    if(method==='GET'&&path.includes('/messages?after=0'))return reply(200,state.messages || []);
    if(method==='POST'&&body?.parent_id&&state.goneCategory===body.parent_id)return reply(400,{code:50035,errors:{parent_id:{_errors:[{message:'Unknown channel'}]}}});
    if(method==='GET'&&path===`/guilds/${GUILD}/roles`)return reply(200,[{id:GUILD,name:'@everyone',permissions:'0',position:0},{id:BOT_ROLE,name:'Endurance Manager',permissions:state.botRights?(state.botPermissions||'1117200'):'0',position:1}]);
    const voice=path.match(/^\/guilds\/\d+\/voice-states\/(\d+)$/);
    if(voice)return voiceStates.has(voice[1])?reply(200,{channel_id:voiceStates.get(voice[1])}):reply(404,{code:10065});
    if(method==='POST'&&path===`/guilds/${GUILD}/channels`&&state.refuseCopy&&(body?.permission_overwrites||[]).some(item=>item.id!=='app-id'&&item.id!==GUILD))return reply(403,{code:50013});
    if(method==='POST'&&path===`/guilds/${GUILD}/channels`){const channel={...body,id:String(next++)};state.channels.push(channel);return reply(200,channel);}
    const channelPath=path.match(/^\/channels\/(\d+)$/);
    if(channelPath){const channel=state.channels.find(item=>item.id===channelPath[1]);if(method==='GET')return channel?reply(200,channel):reply(404,{code:10003});if(method==='DELETE')state.channels=state.channels.filter(item=>item.id!==channelPath[1]);else if(method==='PATCH'&&channel)Object.assign(channel,body);}
    if(method==='POST'||(method==='GET'))return reply(200,{id:String(next++)});
    return reply(method==='DELETE'?204:200,{});
  }
  return {calls,handler,voiceStates,gone,unknownChannel,state};
}

function harness(){
  const DB=new D1();
  linkTestServer(DB.db, DEV); allowCrews(DB.db, DEV);
  const env={DB,APP_ORIGIN:ROOT,COMMUNITY:'commu-dev',DISCORD_CLIENT_ID:'app-id',DISCORD_CLIENT_SECRET:'test-only-secret',DISCORD_BOT_TOKEN:'bot-token',ADMIN_DISCORD_IDS:ADMIN,ASSETS:{fetch:async()=>new Response('static')}};
  const discord=fakeDiscord();
  const jars=new Map();
  async function req(path,method='GET',data,actor='guest'){
    const jar=jars.get(actor)||{};
    const headers={'CF-Connecting-IP':actor,'Cookie':Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; ')};
    if(method!=='GET'){headers.Origin=ROOT;headers['Content-Type']='application/json';}
    const realFetch=globalThis.fetch;globalThis.fetch=discord.handler;
    try{
      const response=await worker.fetch(new Request(ROOT+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(data||{})}),env);
      for(const raw of response.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');const name=pair.slice(0,i),value=pair.slice(i+1);if(value)jar[name]=value;else delete jar[name];}
      jars.set(actor,jar);
      return {status:response.status,data:await response.clone().json().catch(()=>null)};
    }finally{globalThis.fetch=realFetch;}
  }
  async function login(discordId,actor,name){
    const start=await worker.fetch(new Request(ROOT+'/api/auth/discord',{headers:{'CF-Connecting-IP':actor}}),env);
    const state=new URL(start.headers.get('Location')).searchParams.get('state');
    const jar={};for(const raw of start.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');jar[pair.slice(0,i)]=pair.slice(i+1);}jars.set(actor,jar);
    const realFetch=globalThis.fetch;
    globalThis.fetch=async (url,init)=>String(url).endsWith('/token')||String(url).endsWith('/users/@me')
      ?new Response(JSON.stringify(String(url).endsWith('/token')?{access_token:'mock'}:{id:discordId,username:name}),{headers:{'Content-Type':'application/json'}})
      :discord.handler(url,init);
    try{
      const callback=await worker.fetch(new Request(`${ROOT}/api/auth/discord/callback?code=test&state=${state}`,{headers:{'CF-Connecting-IP':actor,'Cookie':Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; ')}}),env);
      for(const raw of callback.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');const key=pair.slice(0,i),value=pair.slice(i+1);if(value)jar[key]=value;else delete jar[key];}
    }finally{globalThis.fetch=realFetch;}
    setMember(DB.db,discordId,discordId===ADMIN?[ORGA_ROLE]:[],{communityId:DEV});
  }
  async function sync(timestamp){
    const realFetch=globalThis.fetch;globalThis.fetch=discord.handler;
    try{return await syncCrewDiscord(env,timestamp,{requests:20});}finally{globalThis.fetch=realFetch;}
  }
  return {DB,env,req,login,sync,discord};
}
const race={name:'6h SPA',circuit:'spa',categories:['Hypercar','GT3'],departures:[{date:'2090-10-15',time:'20:00'}]};
const since=(calls,from)=>calls.slice(from).map(call=>`${call.method} ${call.path}`);
const notifications=async (req,actor)=>(await req('/api/notifications','GET',null,actor)).data.notifications;
const created=(calls,from)=>calls.slice(from).filter(call=>call.method==='POST'&&call.path===`/guilds/${GUILD}/channels`);

test('crew vocals sync every five minutes while quarter-hour maintenance stays separate',async()=>{
  for(const file of ['wrangler.jsonc','wrangler.dev.jsonc','wrangler.prod.jsonc']) {
    const config=JSON.parse(readFileSync(new URL(`../${file}`,import.meta.url),'utf8').replace(/^\s*\/\/.*$/gm,''));
    for(const cron of ['*/2 * * * *','*/5 * * * *','*/15 * * * *']) assert.ok(config.triggers.crons.includes(cron),`${file}: ${cron}`);
  }
  const {DB,env,req,login,discord}=harness();
  await login(ADMIN,'admin','Orga');
  await req('/api/community/modules','PATCH',{crewChannels:true},'admin');
  await req('/api/events','POST',race,'admin');
  const event=(await req('/api/events','GET',null,'admin')).data.events[0],departure=event.departures[0];
  await req(`/api/events/${event.id}/departures/${departure.id}/crews`,'POST',{name:'Toutes les cinq minutes',category:'GT3'},'admin');
  DB.db.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,?,?)').run('expired-before-crew-sync',1,Math.floor(Date.now()/1000)-60);
  env.IRACING_IMPORT='off';
  const prepare=DB.prepare.bind(DB);let crewCheckWrites=0;
  DB.prepare=sql=>{if(sql.startsWith('UPDATE crew_discord SET checked_at='))crewCheckWrites++;return prepare(sql);};
  const scheduled=async(cron,scheduledTime)=>{
    const pending=[],realFetch=globalThis.fetch;globalThis.fetch=discord.handler;
    try{
      await scheduledWorker.scheduled({cron,scheduledTime},env,{waitUntil:promise=>pending.push(promise)});
      await Promise.all(pending);
    }finally{globalThis.fetch=realFetch;}
  };
  const at=Date.UTC(2090,9,14,12,5);
  await scheduled('*/5 * * * *',at);
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();
  assert.ok(row.voice_id&&row.message_id,'the five-minute tick creates the crew vocal');
  assert.equal(row.checked_at,at);
  assert.ok(DB.db.prepare('SELECT 1 FROM rate_limits WHERE key=?').get('expired-before-crew-sync'),'five-minute sync does not run maintenance');
  await scheduled('*/5 * * * *',at+10*60_000);
  assert.equal(DB.db.prepare('SELECT checked_at FROM crew_discord').get().checked_at,at+10*60_000,'the quarter-hour five-minute tick still syncs crews');
  await scheduled('*/15 * * * *',at+10*60_000);
  assert.equal(crewCheckWrites,2,'only the two five-minute ticks check the crew, without a duplicate at the quarter hour');
  assert.equal(DB.db.prepare('SELECT checked_at FROM crew_discord').get().checked_at,at+10*60_000,'maintenance does not sync crews a second time');
  assert.equal(DB.db.prepare('SELECT 1 FROM rate_limits WHERE key=?').get('expired-before-crew-sync'),undefined,'quarter-hour maintenance still runs');
  assert.equal(created(discord.calls,0).length,1,'the same vocal is retained across ticks');
});

test('voice channel setup detects missing Connect even when the bot can manage text channels', async () => {
  const {req,login,discord}=harness();
  await login(ADMIN,'admin','Orga');
  discord.state.botPermissions='68624';
  let settings=(await req('/api/community/settings','GET',null,'admin')).data;
  assert.equal(settings.crews.botReady,false);
  assert.deepEqual(settings.crews.botMissing,['Se connecter']);
  assert.ok(BigInt(new URL(settings.crews.botInviteUrl).searchParams.get('permissions')) & (1n << 17n), 'the unified invite includes the daily announcement mention');
  discord.state.botPermissions='1117200';
  settings=(await req('/api/community/settings','GET',null,'admin')).data;
  assert.equal(settings.crews.botReady,true);
  assert.deepEqual(settings.crews.botMissing,[]);
});

test('a crew gets a voice channel « LMU · race · name » outside any category, followed until 2 h after its race', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');
  // The admins turn the modules on in the settings, once the bot has the rights to make channels.
  discord.state.botRights=false;
  let settings=(await req('/api/community/settings','GET',null,'admin')).data;
  assert.equal(settings.crews.botReady,false);assert.equal(settings.crews.botProblem,'rights');assert.ok(BigInt(new URL(settings.crews.botInviteUrl).searchParams.get('permissions')) & (1n << 17n), 'the unified invite includes the daily announcement mention');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,400);
  discord.state.botAbsent=true;
  settings=(await req('/api/community/settings','GET',null,'admin')).data;
  assert.equal(settings.crews.botReady,null);assert.equal(settings.crews.botProblem,'absent');
  discord.state.botAbsent=false;
  discord.state.botRights=true;
  assert.equal((await req('/api/community/settings','GET',null,'admin')).data.crews.botReady,true);
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true,raceReminders:true},'pilot')).status,403);
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true,raceReminders:true},'admin')).status,200);
  settings=(await req('/api/community/settings','GET',null,'admin')).data;
  assert.equal(settings.modules.crewChannels,true);assert.equal(settings.modules.raceReminders,true);

  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, startsAt=departure.startsAt;
  const entry=await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot');assert.equal(entry.status,201);
  const mate=await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'mate');assert.equal(mate.status,201);
  const crew=await req(base+'/crews','POST',{name:'Les Tondeuz',category:'GT3'},'pilot');assert.equal(crew.status,201);

  // Weeks before, nothing yet; from the Monday of the race's week: one voice channel, no category (the server's
  // owner places it), the recap in its chat.
  let mark=discord.calls.length;
  assert.equal((await sync(startsAt-30*24*HOUR)).opened,0);assert.deepEqual(created(discord.calls,mark),[]);
  assert.equal((await sync(RACE_MONDAY)).opened,1);
  const channels=created(discord.calls,mark);
  assert.equal(channels.length,1);assert.deepEqual(channels[0].body,{name:'🏎️ LMU · 6h SPA · Les Tondeuz',type:2,permission_overwrites:BOT_ACCESS});
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();
  assert.ok(row.voice_id&&row.message_id);assert.equal(row.text_id,null);assert.equal(row.category_id,null);
  const recap=discord.calls.slice(mark).find(call=>call.path===`/channels/${row.voice_id}/messages`);
  assert.match(JSON.stringify(recap.body),/Alice/);assert.doesNotMatch(JSON.stringify(recap.body),/@/);
  assert.deepEqual(recap.body.allowed_mentions,{parse:[]});assert.equal(recap.body.flags,4096);
  // A card: the race, the crew, a button to its page on the site (no preview of the site under it).
  const card=recap.body.embeds[0];
  assert.equal(recap.body.content,'');assert.match(card.description,/^Équipage \*\*Les Tondeuz\*\* · 🔓/);
  assert.match(card.fields.find(field=>field.name.startsWith('👥')).value,/Alice · responsable/);
  assert.equal(recap.body.components[0].components[0].url,card.url);assert.match(card.url,new RegExp(`#event=${event.id}$`));
  // Nothing changed: nothing sent.
  mark=discord.calls.length;await sync(startsAt-3*24*HOUR+HOUR);assert.deepEqual(since(discord.calls,mark),[]);

  // Bob joins and the crew gets a car: the recap is edited (without pinging), no welcome message.
  let crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:mate.data.id,version:crewRow.version,selfJoin:true},'mate')).status,200);
  crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}`,'PATCH',{name:'Les Tondeuz',category:'GT3',car:'Ferrari 296 LMGT3',version:crewRow.version},'pilot')).status,200);
  mark=discord.calls.length;await sync(startsAt-2*24*HOUR);
  const changed=discord.calls.slice(mark);
  assert.deepEqual(changed.map(call=>call.method),['PATCH']);
  assert.equal(changed[0].path,`/channels/${row.voice_id}/messages/${row.message_id}`);assert.match(JSON.stringify(changed[0].body),/Ferrari 296 LMGT3/);assert.deepEqual(changed[0].body.allowed_mentions,{parse:[]});

  // 24 h before: a reminder in the voice channel's chat and on the bell (with the channel); sent once.
  mark=discord.calls.length;await sync(startsAt-23*HOUR);
  const reminder=discord.calls.slice(mark).filter(call=>call.method==='POST');
  assert.equal(reminder.length,1);assert.equal(reminder[0].path,`/channels/${row.voice_id}/messages`);const card24=JSON.stringify(reminder[0].body);assert.match(reminder[0].body.embeds[0].title,/⏰ Rappel · /);
  assert.match(card24,/Alice\\nBob|Bob\\nAlice/);assert.doesNotMatch(card24,/@/);assert.equal(reminder[0].body.components[0].components[0].label,'Page de la course');
  assert.deepEqual(reminder[0].body.allowed_mentions,{parse:[]});assert.equal(reminder[0].body.flags,4096);
  for(const actor of ['pilot','mate']){const item=(await notifications(req,actor)).find(item=>item.kind==='race_reminder');assert.ok(item,actor);assert.equal(item.crewName,'Les Tondeuz');assert.equal(item.channelUrl,`https://discord.com/channels/${GUILD}/${row.voice_id}`);}
  mark=discord.calls.length;await sync(startsAt-22*HOUR);assert.deepEqual(since(discord.calls,mark),[]);
  assert.equal((await notifications(req,'pilot')).filter(item=>item.kind==='race_reminder').length,1);
  // 1 h before: the last reminder.
  mark=discord.calls.length;await sync(startsAt-30*60_000);
  const last=discord.calls.slice(mark).find(call=>call.method==='POST');
  assert.equal(last.path,`/channels/${row.voice_id}/messages`);const card1=last.body.embeds[0].description;assert.match(card1,/on se retrouve ici/);
  assert.match(card1,/Alice · Bob|Bob · Alice/);assert.doesNotMatch(card1,/@/);
  assert.deepEqual(last.body.allowed_mentions,{parse:[]});assert.equal(last.body.flags,4096);

  // 2 h after the end: still a pilot in the voice channel, so it waits; then it is deleted with its chat.
  // The finish counts 30 min of practice and qualifying before the 6 h of race (also shown on the card).
  const endsAt=startsAt+6*HOUR+30*60_000;
  assert.match(JSON.stringify(recap.body),new RegExp(`arrivée <t:${endsAt/1000}:t>`));
  // After the finish: a word to the crew, once.
  mark=discord.calls.length;await sync(endsAt+10*60_000);
  const end=discord.calls.slice(mark).filter(call=>call.method==='POST');
  assert.equal(end.length,1);assert.match(end[0].body.embeds[0].title,/Course terminée, bien joué Les Tondeuz/);assert.equal(end[0].body.flags,4096);
  mark=discord.calls.length;await sync(endsAt+20*60_000);assert.ok(!discord.calls.slice(mark).some(call=>call.method==='POST'));
  assert.equal(CLOSE_AFTER,2*HOUR);
  discord.voiceStates.set(MATE,row.voice_id);
  mark=discord.calls.length;await sync(endsAt+CLOSE_AFTER+HOUR);
  assert.ok(!since(discord.calls,mark).some(call=>call.startsWith('DELETE')));
  assert.equal(DB.db.prepare('SELECT closed_at FROM crew_discord').get().closed_at,null);
  discord.voiceStates.clear();
  mark=discord.calls.length;assert.equal((await sync(endsAt+CLOSE_AFTER+2*HOUR)).closed,1);
  assert.deepEqual(discord.calls.slice(mark).filter(call=>call.method!=='GET').map(call=>`${call.method} ${call.path}`),[`DELETE /channels/${row.voice_id}`]);
  mark=discord.calls.length;await sync(endsAt+CLOSE_AFTER+3*HOUR);assert.deepEqual(since(discord.calls,mark),[]);
});

test('existing crew recaps are silently updated to plain community nicknames', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  await req('/api/community/modules','PATCH',{crewChannels:true},'admin');
  await req('/api/events','POST',race,'admin');
  const event=(await req('/api/events','GET',null,'admin')).data.events[0], departure=event.departures[0];
  const base=`/api/events/${event.id}/departures/${departure.id}`;
  await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot');
  await req(base+'/crews','POST',{name:'Sans ping',category:'GT3'},'pilot');
  await sync(Date.now());
  DB.db.prepare("UPDATE memberships SET nickname='Alice FMT @everyone' WHERE community_id=? AND user_id=?").run(DEV,PILOT);
  DB.db.prepare("UPDATE crew_discord SET recap_hash='old-mentioned-recap'").run();
  const mark=discord.calls.length;await sync(Date.now()+60_000);
  const messages=discord.calls.slice(mark).filter(call=>call.path.includes('/messages'));
  assert.equal(messages.length,1);assert.equal(messages[0].method,'PATCH');
  assert.match(JSON.stringify(messages[0].body),/Alice FMT everyone/);assert.doesNotMatch(JSON.stringify(messages[0].body),/@/);
  assert.deepEqual(messages[0].body.allowed_mentions,{parse:[]});
});

for(const status of [403,500]) test(`audit: an unreadable voice state (${status}) postpones automatic vocal deletion`,async()=>{
  const {DB,env,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  await req('/api/community/modules','PATCH',{crewChannels:true},'admin');
  await req('/api/events','POST',race,'admin');
  const event=(await req('/api/events','GET',null,'admin')).data.events[0],departure=event.departures[0];
  const base=`/api/events/${event.id}/departures/${departure.id}`;
  const registration=await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot');
  const crew=await req(base+'/crews','POST',{name:'Protection',category:'GT3'},'pilot');
  const crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:registration.data.id,version:crewRow.version,selfJoin:true},'pilot');
  await sync(departure.startsAt-HOUR);
  const voice=DB.db.prepare('SELECT voice_id FROM crew_discord').get().voice_id;
  const expiry=departure.startsAt+6*HOUR+CLOSE_AFTER+HOUR,original=globalThis.fetch;
  discord.calls.length=0;
  globalThis.fetch=async(url,options)=>String(url).includes('/voice-states/')
    ? Response.json({code:status===403?50013:0},{status}) : discord.handler(url,options);
  try{await syncCrewDiscord(env,expiry,{requests:20});}finally{globalThis.fetch=original;}
  assert.equal(DB.db.prepare('SELECT closed_at FROM crew_discord').get().closed_at,null);
  assert.equal(discord.calls.some(call=>call.method==='DELETE'),false);
  assert.ok(discord.state.channels.some(channel=>channel.id===voice));
  assert.equal((await sync(expiry+5*60_000)).closed,1,'confirmed absent voice state allows the next cleanup');
});

test('a crew opened by the first version loses its text channel and category, and old archives are deleted', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=departure.startsAt-2*24*HOUR;
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Ancien',category:'GT3'},'pilot')).status,201);
  await sync(at);
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();
  DB.db.prepare("UPDATE crew_discord SET category_id='100000000000000001', text_id='100000000000000002', message_id='100000000000000003'").run();
  DB.db.prepare("INSERT INTO crew_discord(crew_id,community_id,guild_id,created_at,closed_at,archived_id) VALUES('old',?,?,0,?,'100000000000000004')").run(row.community_id,GUILD,at-KEEP_ARCHIVES-HOUR);
  const mark=discord.calls.length;const report=await sync(at+HOUR);
  assert.deepEqual(since(discord.calls,mark),['DELETE /channels/100000000000000002','DELETE /channels/100000000000000001',`POST /channels/${row.voice_id}/messages`,'DELETE /channels/100000000000000004']);
  assert.equal(report.purged,1);
  const now=DB.db.prepare("SELECT * FROM crew_discord WHERE crew_id!='old'").get();
  assert.equal(now.text_id,null);assert.equal(now.category_id,null);assert.equal(now.voice_id,row.voice_id);
});

test('a deleted crew is closed at once, and nothing happens without the module', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`;
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  const crew=await req(base+'/crews','POST',{name:'Solo',category:'GT3'},'pilot');assert.equal(crew.status,201);
  // Module off: nothing, not even a reminder.
  await sync(departure.startsAt-3*24*HOUR);await sync(departure.startsAt-HOUR);
  assert.deepEqual(discord.calls.filter(call=>call.path.startsWith('/channels')),[]);
  assert.deepEqual((await notifications(req,'pilot')).filter(item=>item.kind==='race_reminder'),[]);
  // Module on: opened, then the crew is deleted: its voice channel is deleted.
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await sync(departure.startsAt-2*HOUR)).opened,1);
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();
  const crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  // A stale version cannot delete either the crew or its voice channel.
  let mark=discord.calls.length;
  assert.equal((await req(`/api/crews/${crew.data.id}`,'DELETE',{version:crewRow.version+1},'admin')).status,409);
  assert.deepEqual(since(discord.calls,mark),[]);
  discord.voiceStates.set(PILOT,row.voice_id);
  mark=discord.calls.length;
  assert.equal((await req(`/api/crews/${crew.data.id}`,'DELETE',{version:crewRow.version},'admin')).status,200);
  assert.deepEqual(since(discord.calls,mark),[`DELETE /channels/${row.voice_id}`]);
  mark=discord.calls.length;assert.equal((await sync(departure.startsAt-HOUR)).closed,0);
  assert.deepEqual(since(discord.calls,mark),[]);
  const closed=DB.db.prepare('SELECT * FROM crew_discord').get();
  assert.ok(closed.closed_at);
});

test('a recap or a voice channel deleted on Discord is made again', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=departure.startsAt-2*24*HOUR;
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Retour',category:'GT3'},'pilot')).status,201);
  await sync(at);
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();assert.ok(row.message_id);
  // Someone deletes the recap: it comes back at the next checks.
  discord.gone.add(`/channels/${row.voice_id}/messages/${row.message_id}`);
  DB.db.prepare("UPDATE crew_discord SET recap_hash=''").run();
  await sync(at+HOUR);
  assert.equal(DB.db.prepare('SELECT message_id FROM crew_discord').get().message_id,null);
  let mark=discord.calls.length;await sync(at+2*HOUR);
  assert.deepEqual(since(discord.calls,mark),[`GET /channels/${row.voice_id}`,`POST /channels/${row.voice_id}/messages`]);
  // Someone deletes the voice channel: a new one, with the recap.
  const now=DB.db.prepare('SELECT * FROM crew_discord').get();
  discord.unknownChannel.add(`/channels/${row.voice_id}/messages/${now.message_id}`);
  DB.db.prepare("UPDATE crew_discord SET recap_hash=''").run();
  await sync(at+3*HOUR);
  assert.equal(DB.db.prepare('SELECT voice_id FROM crew_discord').get().voice_id,null);
  mark=discord.calls.length;await sync(at+4*HOUR);
  const again=discord.calls.slice(mark);
  assert.deepEqual(again[0].body,{name:'🏎️ LMU · 6h SPA · Retour',type:2,permission_overwrites:BOT_ACCESS});
  assert.equal(again[1].method,'POST');assert.match(again[1].path,/\/messages$/);
});

test('the admins choose where the voice channels are made, as soon as they turn the module on', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/settings','GET',null,'admin')).data.crews.categories,null);
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  const crews=(await req('/api/community/settings','GET',null,'admin')).data.crews;
  assert.deepEqual(crews.categories,[{id:'500000000000000001',name:'Accueil'},{id:'500000000000000002',name:'Courses'}]);assert.equal(crews.voiceCategoryId,null);
  assert.equal((await req('/api/community/modules','PATCH',{crewCategory:'500000000000000003'},'admin')).status,400);
  assert.equal((await req('/api/community/modules','PATCH',{crewCategory:'500000000000000002'},'pilot')).status,403);
  assert.equal((await req('/api/community/modules','PATCH',{crewCategory:'500000000000000002'},'admin')).status,200);
  assert.equal((await req('/api/community/settings','GET',null,'admin')).data.crews.voiceCategoryId,'500000000000000002');
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=departure.startsAt-2*24*HOUR;
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Rangés',category:'GT3'},'pilot')).status,201);
  let mark=discord.calls.length;await sync(at);
  assert.deepEqual(created(discord.calls,mark)[0].body,{name:'🏎️ LMU · 6h SPA · Rangés',type:2,parent_id:'500000000000000002',permission_overwrites:BOT_ACCESS});
  // The category is deleted on Discord: the choice is forgotten, the admins are told, the next one goes on top.
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();
  discord.state.goneCategory='500000000000000002';
  discord.unknownChannel.add(`/channels/${row.voice_id}/messages/${row.message_id}`);
  DB.db.prepare("UPDATE crew_discord SET recap_hash=''").run();
  await sync(at+HOUR);await sync(at+2*HOUR);
  const setting=DB.db.prepare('SELECT * FROM community_crew_discord').get();
  assert.equal(setting.voice_category_id,null);assert.match(setting.last_error,/n’existe plus/);
  mark=discord.calls.length;await sync(at+3*HOUR);
  assert.deepEqual(created(discord.calls,mark)[0].body,{name:'🏎️ LMU · 6h SPA · Rangés',type:2,permission_overwrites:BOT_ACCESS});
  assert.equal((await req('/api/community/modules','PATCH',{crewCategory:''},'admin')).status,200);
});

test('when the recap gives each race its category, the crews\' voice channels go there, named after the crew', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=departure.startsAt-2*24*HOUR;
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Avant',category:'GT3'},'pilot')).status,201);
  await sync(at);
  const first=DB.db.prepare('SELECT * FROM crew_discord').get();assert.equal(first.parent_id,null);
  // The recap makes the race's category (a category chosen by the admins is never taken for it).
  DB.db.prepare("INSERT INTO community_recap_settings(community_id,mode,scope,guild_id,destination_id,destination_name) VALUES(?,'events','all',?,'500000000000000002','Courses')").run(DEV,GUILD);
  DB.db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,category_id,marker) VALUES(?,?,?,'500000000000000002','m')").run(DEV,event.id,GUILD);
  let mark=discord.calls.length;await sync(at+HOUR);assert.deepEqual(since(discord.calls,mark),[]);
  discord.state.channels.push({id:'600000000000000001',type:4,name:'Course'});
  DB.db.prepare("UPDATE discord_recap_publications SET category_id='600000000000000001'").run();
  mark=discord.calls.length;await sync(at+2*HOUR);
  assert.deepEqual(discord.calls.slice(mark).filter(call=>call.method==='PATCH').map(call=>[call.method,call.path,call.body]),[['PATCH',`/channels/${first.voice_id}`,{parent_id:'600000000000000001',name:'Avant',permission_overwrites:BOT_ACCESS}]]);
  mark=discord.calls.length;await sync(at+3*HOUR);assert.deepEqual(since(discord.calls,mark),[]);
  // A crew made afterwards is created there directly.
  await login('444444444444444444','third','Chloé');
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'third')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Après',category:'GT3'},'third')).status,201);
  mark=discord.calls.length;await sync(at+4*HOUR);
  assert.deepEqual(created(discord.calls,mark)[0].body,{name:'Après',type:2,parent_id:'600000000000000001',permission_overwrites:BOT_ACCESS});
});

test('with « Une catégorie par course », a new crew\'s voice channel waits for its race\'s category, at most an hour', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=RACE_MONDAY;
  DB.db.prepare("INSERT INTO community_recap_settings(community_id,enabled,mode,scope,guild_id,destination_id,destination_name) VALUES(?,1,'events','lmu',?,'500000000000000002','Courses')").run(DEV,GUILD);
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Attente',category:'GT3'},'pilot')).status,201);
  let mark=discord.calls.length;await sync(at);await sync(at+30*60_000);assert.deepEqual(created(discord.calls,mark),[]);
  // Made by the recap in the meantime: the voice channel goes straight there.
  discord.state.channels.push({id:'600000000000000001',type:4,name:'Course'});
  DB.db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,category_id,marker) VALUES(?,?,?,'600000000000000001','m')").run(DEV,event.id,GUILD);
  mark=discord.calls.length;await sync(at+40*60_000);
  assert.deepEqual(created(discord.calls,mark)[0].body,{name:'Attente',type:2,parent_id:'600000000000000001',permission_overwrites:BOT_ACCESS});
  assert.ok(!discord.calls.slice(mark).some(call=>call.method==='PATCH'&&call.path.startsWith('/channels/')&&call.body?.parent_id),'never moved');
  // No category after an hour (recap failing): made where the admins chose.
  DB.db.prepare('DELETE FROM discord_recap_publications').run();DB.db.prepare('DELETE FROM crew_discord').run();
  mark=discord.calls.length;await sync(at+2*HOUR);assert.deepEqual(created(discord.calls,mark),[]);
  mark=discord.calls.length;await sync(at+3*HOUR+60_000);
  assert.deepEqual(created(discord.calls,mark)[0].body,{name:'🏎️ LMU · 6h SPA · Attente',type:2,permission_overwrites:BOT_ACCESS});
});

test('a race category deleted on Discord is forgotten: no error, the recap makes it again', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=departure.startsAt-2*24*HOUR;
  DB.db.prepare("INSERT INTO community_recap_settings(community_id,enabled,mode,scope,guild_id,destination_id,destination_name) VALUES(?,1,'events','lmu',?,'500000000000000002','Courses')").run(DEV,GUILD);
  DB.db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,category_id,marker) VALUES(?,?,?,'600000000000000009','m')").run(DEV,event.id,GUILD);
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Perdue',category:'GT3'},'pilot')).status,201);
  await sync(at);
  assert.equal(DB.db.prepare('SELECT category_id FROM discord_recap_publications').get().category_id,null);
  assert.equal(DB.db.prepare('SELECT last_error FROM community_crew_discord').get().last_error,null);
  assert.equal(DB.db.prepare('SELECT dirty FROM community_recap_settings').get().dirty,1);
});

test('« un fil par course »: voices straight in the bot\'s category (no waiting for a race category), none for a sim not shown', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=departure.startsAt-2*24*HOUR;
  discord.state.channels.push({id:'600000000000000007',type:4,name:'Endurance Manager'});
  DB.db.prepare("UPDATE community_crew_discord SET voice_category_id='600000000000000007'").run();
  DB.db.prepare(`INSERT INTO community_recap_settings(community_id,enabled,mode,scope,guild_id,destination_id,destination_name,layout) VALUES(?,1,'events','lmu',?,'600000000000000007','Endurance Manager','{"mode":"events","sims":"lmu"}')`).run(DEV,GUILD);
  DB.db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,channel_id,in_thread,marker) VALUES(?,?,?,'600000000000000008',1,'m')").run(DEV,event.id,GUILD);
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Fil',category:'GT3'},'pilot')).status,201);
  let mark=discord.calls.length;await sync(at);
  assert.deepEqual(created(discord.calls,mark)[0].body,{name:'🏎️ LMU · 6h SPA · Fil',type:2,parent_id:'600000000000000007',permission_overwrites:BOT_ACCESS});
  // An iRacing race with « LMU » only: no voice.
  DB.db.prepare("UPDATE events SET circuit='iracing-spa' WHERE id=?").run(event.id);
  DB.db.prepare('DELETE FROM crew_discord').run();
  mark=discord.calls.length;await sync(at+60_000);assert.deepEqual(created(discord.calls,mark),[]);
});

test('a category rule with a right the bot lacks: the voice retries with public access only', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=departure.startsAt-2*24*HOUR;
  discord.state.channels.push({id:'600000000000000007',type:4,name:'Vocal',permission_overwrites:[{id:'600000000000000010',type:0,allow:String(1n<<22n),deny:'0'}]});
  discord.state.refuseCopy=true;
  DB.db.prepare("UPDATE community_crew_discord SET voice_category_id='600000000000000007'").run();
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Copie',category:'GT3'},'pilot')).status,201);
  const mark=discord.calls.length;await sync(at);
  const posts=created(discord.calls,mark);
  assert.equal(posts.length,2);assert.deepEqual(posts[1].body.permission_overwrites,BOT_ACCESS);assert.equal(posts[1].body.parent_id,'600000000000000007');
  assert.ok(DB.db.prepare('SELECT voice_id FROM crew_discord').get().voice_id);
});

test('« un fil par course » with LMU and iRacing apart: an iRacing race\'s voices go in « iRacing », not « LMU »', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=departure.startsAt-2*24*HOUR;
  DB.db.prepare("UPDATE events SET circuit='iracing-spa' WHERE id=?").run(event.id);
  discord.state.channels.push({id:'600000000000000007',type:4,name:'LMU'},{id:'600000000000000009',type:4,name:'iRacing'});
  DB.db.prepare("UPDATE community_crew_discord SET voice_category_id='600000000000000007'").run();
  DB.db.prepare(`INSERT INTO community_recap_settings(community_id,enabled,mode,scope,guild_id,destination_id,destination_name,iracing_destination_id,layout,bot_categories) VALUES(?,1,'events','all',?,'600000000000000007','LMU','600000000000000009','{"mode":"events","sims":"all","split":true}','{"lmu":"600000000000000007","iracing":"600000000000000009"}')`).run(DEV,GUILD);
  DB.db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,channel_id,in_thread,marker) VALUES(?,?,?,'600000000000000008',1,'m')").run(DEV,event.id,GUILD);
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Fil',category:'GT3'},'pilot')).status,201);
  const mark=discord.calls.length;await sync(at);
  assert.equal(created(discord.calls,mark)[0].body.parent_id,'600000000000000009');
});

test('an empty crew gets its voice channel from the Monday of its race\'s week', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0], departure=event.departures[0];
  DB.db.prepare("INSERT INTO crews(id,event_id,departure_id,name,category,car,locked,created_at,community_id) VALUES('empty',?,?,'Sans pilote','GT3','',0,0,?)").run(event.id,departure.id,DEV);
  const mark=discord.calls.length;
  // The Sunday before (Paris), nothing; on Monday 00:00 Paris (22:00 UTC on Sunday, summer time), the voice.
  const monday=Date.parse('2090-10-08T22:00:00Z');
  assert.equal((await sync(monday-1)).opened,0);
  assert.equal((await sync(monday)).opened,1);
  assert.deepEqual(created(discord.calls,mark).map(call=>call.body.name),['🏎️ LMU · 6h SPA · Sans pilote']);
});

 test('Discord deletion failures keep the tracking row for a scheduled retry', async () => {
  const {DB,env,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0], departure=event.departures[0];
  const crew=await req(`/api/events/${event.id}/departures/${departure.id}/crews`,'POST',{name:'Retry',category:'GT3'},'admin');
  await sync(Date.now());
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();
  // A live crew cannot be cleaned up through the targeted helper.
  await closeDeletedCrewDiscord(env,crew.data.id);
  assert.equal(DB.db.prepare('SELECT voice_id FROM crew_discord').get().voice_id,row.voice_id);
  const crewRow=DB.db.prepare('SELECT * FROM crews WHERE id=?').get(crew.data.id);
  discord.state.deleteStatus=403;
  // A crew made more than a week ago must still be retried until Discord confirms deletion.
  DB.db.prepare('UPDATE crew_discord SET created_at=? WHERE crew_id=?').run(Date.now()-10*24*HOUR,crew.data.id);
  assert.equal((await req(`/api/crews/${crew.data.id}`,'DELETE',{version:crewRow.version},'admin')).status,200);
  const pending=DB.db.prepare('SELECT * FROM crew_discord').get();
  assert.equal(pending.closed_at,null);assert.equal(pending.voice_id,row.voice_id);assert.equal(pending.lock_until,0);
  assert.match(DB.db.prepare('SELECT last_error FROM community_crew_discord WHERE community_id=?').get(DEV).last_error,/suppression du salon.*Se connecter/);
  assert.equal((await sync(Date.now()+30_000)).closed,0);
  assert.equal(DB.db.prepare('SELECT closed_at FROM crew_discord').get().closed_at,null);
  discord.state.deleteStatus=null;
  const mark=discord.calls.length;
  assert.equal((await sync(Date.now()+60_000)).closed,1);
  assert.deepEqual(since(discord.calls,mark),[`DELETE /channels/${row.voice_id}`]);
  assert.equal(DB.db.prepare('SELECT last_error FROM community_crew_discord WHERE community_id=?').get(DEV).last_error,null);
});

test('migration resumes abandoned cleanup without reopening successfully closed channels or archives', async () => {
  const {DB,sync,discord}=harness();
  const at=Date.now(), voice='700000000000000099';
  const insert=DB.db.prepare(`INSERT INTO crew_discord(crew_id,community_id,guild_id,voice_id,created_at,closed_at,archived_id)
    VALUES(?,?,?,?,?,?,?)`);
  insert.run('orphan',DEV,GUILD,voice,at-10*24*HOUR,at-HOUR,null);
  insert.run('finished',DEV,GUILD,null,at-10*24*HOUR,at-HOUR,null);
  insert.run('archived',DEV,GUILD,null,at-10*24*HOUR,at-HOUR,'700000000000000098');
  DB.db.exec(readFileSync(new URL('../migrations/0071_retry_crew_channel_cleanup.sql',import.meta.url),'utf8'));
  assert.equal(DB.db.prepare("SELECT closed_at FROM crew_discord WHERE crew_id='orphan'").get().closed_at,null);
  for(const id of ['finished','archived'])assert.equal(DB.db.prepare('SELECT closed_at FROM crew_discord WHERE crew_id=?').get(id).closed_at,at-HOUR);
  assert.equal((await sync(at)).closed,1);
  assert.deepEqual(since(discord.calls,0),[`DELETE /channels/${voice}`]);
  assert.equal(DB.db.prepare("SELECT voice_id FROM crew_discord WHERE crew_id='orphan'").get().voice_id,null);
});

test('scheduled cleanup recovers rows closed by older code without requiring the repair migration', async () => {
  const {DB,sync,discord}=harness();
  const at=Date.now(), voice='700000000000000099';
  DB.db.prepare(`INSERT INTO crew_discord(crew_id,community_id,guild_id,voice_id,created_at,closed_at)
    VALUES('abandoned',?,?,?,?,?)`).run(DEV,GUILD,voice,at-10*24*HOUR,at-HOUR);
  assert.equal((await sync(at)).closed,1);
  assert.deepEqual(since(discord.calls,0),[`DELETE /channels/${voice}`]);
  assert.equal(DB.db.prepare("SELECT voice_id FROM crew_discord WHERE crew_id='abandoned'").get().voice_id,null);
});

test('overlapping syncs do not create a second voice channel from an outdated snapshot', async () => {
  const {DB,env,req,login,discord}=harness();
  await login(ADMIN,'admin','Orga');
  await req('/api/community/modules','PATCH',{crewChannels:true},'admin');
  await req('/api/events','POST',race,'admin');
  const event=(await req('/api/events','GET',null,'admin')).data.events[0], departure=event.departures[0];
  const crew=await req(`/api/events/${event.id}/departures/${departure.id}/crews`,'POST',{name:'SPM RED',category:'GT3'},'admin');
  // One sync has read the row, but pauses before locking it. Another sync finishes first.
  const prepare=DB.prepare.bind(DB);
  let release, captured;
  const gate=new Promise(resolve=>{release=resolve;});
  const ready=new Promise(resolve=>{captured=resolve;});
  let pause=true;
  DB.prepare=sql=>{
    const statement=prepare(sql);
    if(sql.includes('SELECT d.crew_id AS row_id')&&pause){
      pause=false;
      const all=statement.all.bind(statement);
      statement.all=async()=>{const snapshot=await all();captured();await gate;return snapshot;};
    }
    return statement;
  };
  const realFetch=globalThis.fetch;globalThis.fetch=discord.handler;
  try{
    const delayed=syncCrewDiscord(env,Date.now(),{requests:20});
    await ready;
    await syncCrewDiscord(env,Date.now(),{requests:20});
    release();await delayed;
  }finally{release();DB.prepare=prepare;globalThis.fetch=realFetch;}
  assert.equal(created(discord.calls,0).length,1,'only one voice channel may exist for the crew');
  const row=DB.db.prepare('SELECT * FROM crews WHERE id=?').get(crew.data.id);
  const voice=DB.db.prepare('SELECT voice_id FROM crew_discord WHERE crew_id=?').get(crew.data.id).voice_id;
  const mark=discord.calls.length;
  assert.equal((await req(`/api/crews/${crew.data.id}`,'DELETE',{version:row.version},'admin')).status,200);
  assert.deepEqual(since(discord.calls,mark),[`DELETE /channels/${voice}`]);
});

for (const previousSchema of [false,true]) test(`automatic recovery protects live crews and unrelated channels (previous schema: ${previousSchema})`, async () => {
  const {DB,env,req,login,discord}=harness();
  if(previousSchema) DB.db.exec('ALTER TABLE community_crew_discord DROP COLUMN orphan_checked_at; ALTER TABLE community_crew_discord DROP COLUMN orphan_cursor;');
  await login(ADMIN,'admin','Orga');
  await req('/api/community/modules','PATCH',{crewChannels:true},'admin');
  await req('/api/events','POST',race,'admin');
  const event=(await req('/api/events','GET',null,'admin')).data.events[0], departure=event.departures[0];
  const crew=await req(`/api/events/${event.id}/departures/${departure.id}/crews`,'POST',{name:'SPM RED',category:'GT3'},'admin');
  const category='600000000000000001', voice='700000000000000099';
  DB.db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,category_id,marker) VALUES(?,?,?,?,'m')").run(DEV,event.id,GUILD,category);
  discord.state.channels=[{id:voice,type:2,name:'SPM RED',parent_id:category}];
  const content=`🏁 **6h SPA** · LMU\n👥 Équipage **SPM RED** : personne pour l’instant\n🔗 Inscriptions et équipage : ${ROOT}/lmu/#event=${event.id}`;
  discord.state.messages=[{author:{id:env.DISCORD_CLIENT_ID,bot:true},content}];
  const realFetch=globalThis.fetch;globalThis.fetch=discord.handler;
  try{
    assert.equal(await cleanupOrphanCrewDiscord(env),0,'an existing crew protects its channel');
    DB.db.prepare('DELETE FROM crews WHERE id=?').run(crew.data.id);
    discord.state.messages[0].author.id='other-bot';
    assert.equal(await cleanupOrphanCrewDiscord(env),0,'a different bot is never evidence of ownership');
    discord.state.messages[0].author.id=env.DISCORD_CLIENT_ID;
    discord.state.messages[0].content=content.replace(event.id,'another-event');
    assert.equal(await cleanupOrphanCrewDiscord(env),0,'a recap for another race is ignored');
    discord.state.messages[0].content=content;
    DB.db.prepare('INSERT INTO crew_discord(crew_id,community_id,guild_id,voice_id,created_at) VALUES(?,?,?,?,?)').run('tracked',DEV,GUILD,voice,Date.now());
    assert.equal(await cleanupOrphanCrewDiscord(env),0,'tracked channels follow the normal cleanup');
    DB.db.prepare("DELETE FROM crew_discord WHERE crew_id='tracked'").run();
    discord.state.deleteStatus=403;
    await assert.rejects(cleanupOrphanCrewDiscord(env),/403/);
    discord.state.deleteStatus=null;
    assert.equal(await cleanupOrphanCrewDiscord(env),1,'a failed deletion is retried without admin action');
    assert.equal(discord.calls.filter(call=>call.method==='DELETE').at(-1).path,`/channels/${voice}`);
  }finally{globalThis.fetch=realFetch;}
});


test('private voice destination blocks activation before writes; an admin exception lets the bot create a public vocal',async()=>{
  const {DB,req,login,discord,sync}=harness();
  await login(ADMIN,'admin','Orga');
  const category=discord.state.channels.find(item=>item.name==='Courses');
  category.permission_overwrites=[{id:GUILD,type:0,allow:'0',deny:'1049600'},{id:ORGA_ROLE,type:0,allow:'1049600',deny:'0'}];
  let result=await req('/api/community/modules','PATCH',{crewChannels:true,crewCategory:category.id},'admin');
  assert.equal(result.status,400);assert.match(result.data.error,/Courses.*Voir le salon.*Se connecter/);
  assert.equal(DB.db.prepare('SELECT count(*) n FROM community_crew_discord').get().n,0,'refused configuration is not saved');
  const original=structuredClone(category.permission_overwrites);
  category.permission_overwrites.push(BOT_ACCESS[0]);
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true,crewCategory:category.id},'admin')).status,200);
  await req('/api/events','POST',race,'admin');
  const event=(await req('/api/events','GET',null,'admin')).data.events[0],departure=event.departures[0];
  await req(`/api/events/${event.id}/departures/${departure.id}/crews`,'POST',{name:'Pilotes privés',category:'GT3'},'admin');
  assert.equal((await sync(Date.now())).opened,1);
  const voice=discord.state.channels.find(item=>item.name==='🏎️ LMU · 6h SPA · Pilotes privés');
  assert.deepEqual(voice.permission_overwrites.slice(0,2),[{id:GUILD,type:0,allow:'2080965379087937',deny:'0'},original[1]]);
  assert.deepEqual(voice.permission_overwrites.at(-1),BOT_ACCESS[0]);
  // A vocal made by the previous version is opened on the next sync, without recreation.
  voice.permission_overwrites = [...structuredClone(original),BOT_ACCESS[0]];
  DB.db.prepare("UPDATE crew_discord SET recap_hash='legacy-private-vocal'").run();
  const repairMark=discord.calls.length;
  await sync(Date.now()+60_000);
  assert.deepEqual(voice.permission_overwrites.slice(0,2),[BOT_ACCESS[1],original[1]]);
  assert.equal(created(discord.calls,repairMark).length,0);
  const stableMark=discord.calls.length;
  await sync(Date.now()+120_000);
  assert.equal(discord.calls.slice(stableMark).filter(call=>call.method==='PATCH'&&call.path===`/channels/${voice.id}`).length,0);
  // The destination remains accessible, but an existing vocal gets a local restriction later.
  voice.permission_overwrites.find(item=>item.id==='app-id').allow='68624';
  voice.permission_overwrites.find(item=>item.id==='app-id').deny='1048576';
  const state=(await req('/api/community/settings','GET',null,'admin')).data.crews;
  assert.equal(state.botReady,false);assert.equal(state.botProblem,'channel');
  assert.equal(state.botChannelName,voice.name);assert.deepEqual(state.botMissing,['Se connecter']);
});


for(const previousVersion of [1,2]) test(`existing v${previousVersion} crew vocals gain normal features once without being recreated`,async()=>{
  const {DB,req,login,discord,sync}=harness();
  await login(ADMIN,'admin','Orga');
  await req('/api/community/modules','PATCH',{crewChannels:true},'admin');
  await req('/api/events','POST',race,'admin');
  const event=(await req('/api/events','GET',null,'admin')).data.events[0],departure=event.departures[0];
  await req(`/api/events/${event.id}/departures/${departure.id}/crews`,'POST',{name:'Voix libre',category:'GT3'},'admin');
  await sync(Date.now());
  const tracked=DB.db.prepare('SELECT * FROM crew_discord').get();
  const voice=discord.state.channels.find(item=>item.id===tracked.voice_id);
  const features=(1n<<9n)|(1n<<15n)|(1n<<25n)|(1n<<39n)|(1n<<42n);
  assert.equal(BigInt(voice.permission_overwrites.find(item=>item.id===GUILD).allow)&features,features,'new vocals allow streaming, chat files, voice activity, activities and soundboard');
  voice.permission_overwrites.find(item=>item.id===GUILD).allow=previousVersion===1?'3146752':'36701184';
  voice.permission_overwrites.push({id:ORGA_ROLE,type:0,allow:'0',deny:String(features|(1n<<22n))});
  voice.permission_overwrites.push({id:PILOT,type:1,allow:'0',deny:String(features)});
  const previousHash=tracked.recap_hash.replace('public-voice-v3:',`public-voice-v${previousVersion}:`);
  DB.db.prepare('UPDATE crew_discord SET recap_hash=?').run(previousHash);
  const mark=discord.calls.length;
  await sync(Date.now()+60_000);
  const patches=discord.calls.slice(mark).filter(call=>call.method==='PATCH'&&call.path===`/channels/${voice.id}`);
  assert.equal(patches.length,1);
  assert.equal(created(discord.calls,mark).length,0,'the existing vocal stays in place');
  assert.equal(voice.permission_overwrites.find(item=>item.id===GUILD).allow,'2080965379087937');
  assert.equal(voice.permission_overwrites.find(item=>item.id===ORGA_ROLE).deny,String(1n<<22n),'unrelated restrictions are preserved');
  assert.equal(voice.permission_overwrites.find(item=>item.id===PILOT).deny,'0');
  const repaired=DB.db.prepare('SELECT * FROM crew_discord').get();
  assert.equal(repaired.voice_id,tracked.voice_id);assert.equal(repaired.message_id,tracked.message_id);
  assert.match(repaired.recap_hash,/^public-voice-v3:/);
  const stableMark=discord.calls.length;
  await sync(Date.now()+120_000);
  assert.equal(discord.calls.slice(stableMark).filter(call=>call.method==='PATCH'&&call.path===`/channels/${voice.id}`).length,0,'the repair runs once');
});

test('moving a root fallback vocal into a private race category opens access for all server members',async()=>{
  const {DB,req,login,discord,sync}=harness();
  await login(ADMIN,'admin','Orga');await req('/api/community/modules','PATCH',{crewChannels:true},'admin');
  await req('/api/events','POST',race,'admin');
  const event=(await req('/api/events','GET',null,'admin')).data.events[0],departure=event.departures[0];
  await req(`/api/events/${event.id}/departures/${departure.id}/crews`,'POST',{name:'Déplacé',category:'GT3'},'admin');
  await sync(Date.now());
  const tracked=DB.db.prepare('SELECT * FROM crew_discord').get();
  const parent='600000000000000001',rules=[{id:GUILD,type:0,allow:'0',deny:'1049600'},{id:ORGA_ROLE,type:0,allow:'1049600',deny:'0'}];
  discord.state.channels.push({id:parent,type:4,name:'Course privée',permission_overwrites:structuredClone(rules)});
  DB.db.prepare("INSERT INTO community_recap_settings(community_id,mode,scope,guild_id,destination_id,destination_name) VALUES(?,'events','all',?,'500000000000000002','Courses')").run(DEV,GUILD);
  DB.db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,category_id,marker) VALUES(?,?,?,?,'p')").run(DEV,event.id,GUILD,parent);
  await sync(Date.now()+60_000);
  const voice=discord.state.channels.find(item=>item.id===tracked.voice_id);
  assert.equal(voice.parent_id,parent);
  assert.deepEqual(voice.permission_overwrites,BOT_ACCESS);
});

test('a voice channel made before the admins chose « Vocaux d’équipage » moves there once, with its new name', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=departure.startsAt-2*24*HOUR;
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Anciens',category:'GT3'},'pilot')).status,201);
  await sync(at);
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();
  // Named and placed by an older version, at the top of the server.
  Object.assign(discord.state.channels.find(item=>item.id===row.voice_id),{name:'LMU-Anciens'});
  assert.equal((await req('/api/community/modules','PATCH',{crewCategory:'500000000000000002'},'admin')).status,200);
  const mark=discord.calls.length;await sync(at+HOUR);
  const moves=discord.calls.slice(mark).filter(call=>call.method==='PATCH'&&call.path===`/channels/${row.voice_id}`);
  assert.equal(moves.length,1);assert.equal(moves[0].body.parent_id,'500000000000000002');assert.equal(moves[0].body.name,'🏎️ LMU · 6h SPA · Anciens');
  assert.equal(DB.db.prepare('SELECT parent_id FROM crew_discord').get().parent_id,'500000000000000002');
  const again=discord.calls.length;await sync(at+2*HOUR);
  assert.equal(discord.calls.slice(again).filter(call=>call.method==='PATCH'&&call.path===`/channels/${row.voice_id}`).length,0,'moved once');
});

test('switching to « récap de la semaine » takes the voices out of their race category before it goes', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=departure.startsAt-2*24*HOUR;
  DB.db.prepare("INSERT INTO community_recap_settings(community_id,mode,scope,guild_id,destination_id,destination_name) VALUES(?,'events','all',?,'500000000000000002','Courses')").run(DEV,GUILD);
  discord.state.channels.push({id:'600000000000000001',type:4,name:'Course'});
  DB.db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,category_id,marker) VALUES(?,?,?,'600000000000000001','m')").run(DEV,event.id,GUILD);
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Équipage A',category:'GT3'},'pilot')).status,201);
  await sync(at);
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();assert.equal(row.parent_id,'600000000000000001');
  // The admins switch to the weekly recap with a « pit walk » category; the race category is still there.
  DB.db.prepare("UPDATE community_recap_settings SET mode='general'").run();
  assert.equal((await req('/api/community/modules','PATCH',{crewCategory:'500000000000000002'},'admin')).status,200);
  const mark=discord.calls.length;await sync(at+HOUR);
  const moves=discord.calls.slice(mark).filter(call=>call.method==='PATCH'&&call.path===`/channels/${row.voice_id}`);
  assert.equal(moves.length,1);assert.equal(moves[0].body.parent_id,'500000000000000002');assert.equal(moves[0].body.name,'🏎️ LMU · 6h SPA · Équipage A');
});

test('voices turned off: the voice channel goes, and comes back if they are turned on again before the race', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, at=departure.startsAt-2*24*HOUR;
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Équipage A',category:'GT3'},'pilot')).status,201);
  await sync(at);
  const voice=DB.db.prepare('SELECT voice_id FROM crew_discord').get().voice_id;assert.ok(voice);
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:false},'admin')).status,200);
  await sync(at+HOUR);
  assert.equal(discord.state.channels.some(item=>item.id===voice),false,'deleted');
  const row=DB.db.prepare('SELECT voice_id,closed_at FROM crew_discord').get();assert.equal(row.voice_id,null);assert.equal(row.closed_at,null);
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  await sync(at+2*HOUR);
  assert.ok(DB.db.prepare('SELECT voice_id FROM crew_discord').get().voice_id,'made again');
});

test('a channel the bot tracked but that is gone from the server does not block the setting',async()=>{
  const {DB,req,login,discord}=harness();
  await login(ADMIN,'admin','Orga');
  const category=discord.state.channels.find(item=>item.name==='Courses');
  DB.db.prepare('INSERT INTO crew_discord(crew_id,community_id,guild_id,voice_id,created_at) VALUES(?,?,?,?,?)').run('gone',DEV,GUILD,'700000000000000555',Date.now());
  DB.db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,category_id,marker) VALUES(?,?,?,?,'m')").run(DEV,'week:lmu',GUILD,'600000000000000555#lmu-de-la-semaine');
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true,crewCategory:category.id},'admin')).status,200);
  const result=await req('/api/community/modules','PATCH',{crewCategory:'600000000000000556'},'admin');
  assert.equal(result.status,400,'a category the admin just chose must still exist');
});

test('automatic recovery also removes an untracked crew voice left in the « pit talk » category', async () => {
  const {DB,env,req,login,discord}=harness();
  await login(ADMIN,'admin','Orga');
  await req('/api/community/modules','PATCH',{crewChannels:true},'admin');
  await req('/api/events','POST',race,'admin');
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const pitTalk='600000000000000077', voice='700000000000000098', other='700000000000000097';
  DB.db.prepare('UPDATE community_crew_discord SET voice_category_id=? WHERE community_id=?').run(pitTalk,DEV);
  discord.state.channels=[{id:voice,type:2,name:'🏎️ LMU · 6h SPA · Fantôme',parent_id:pitTalk},{id:other,type:2,name:'Discussion',parent_id:pitTalk}];
  discord.state.messages=[{author:{id:env.DISCORD_CLIENT_ID,bot:true},embeds:[{url:`${ROOT}/lmu/#event=${event.id}`,description:'Équipage **Fantôme** · 🔓 ouvert'}]}];
  const realFetch=globalThis.fetch;globalThis.fetch=discord.handler;
  try{
    // One voice looked at per pass: the server's own « Discussion » first (its name is no crew's), then the crew's.
    assert.equal(await cleanupOrphanCrewDiscord(env),0);
    assert.equal(await cleanupOrphanCrewDiscord(env),1);
    assert.deepEqual(discord.calls.filter(call=>call.method==='DELETE').map(call=>call.path),[`/channels/${voice}`]);
    // A voice of the server's own, without the bot's card, is never touched.
    discord.state.messages=[];
    assert.equal(await cleanupOrphanCrewDiscord(env),0);
  }finally{globalThis.fetch=realFetch;}
});
