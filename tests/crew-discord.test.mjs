import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {syncCrewDiscord, OPEN_BEFORE, CLOSE_AFTER} from '../server/crew-discord.mjs';
import {linkTestServer, setMember, ORGA_ROLE, GUILD} from './fixtures/discord-server.mjs';

// Crews on Discord and race reminders (migration 0044): the bot is a fake Discord that records each request.
const ROOT='https://site.example';
const ADMIN='111111111111111111', PILOT='222222222222222222', MATE='333333333333333333';
const DEV='e0a1c0de-0000-4000-8000-000000000001';
const THREADS='800000000000000001', VOICES='800000000000000002';
const HOUR=3600_000;
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();

class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}

// Fake Discord: every request is kept; new channels, threads and messages get new ids.
function fakeDiscord(){
  const calls=[];let next=700000000000000000n;const voiceStates=new Map();const gone=new Set();
  const reply=(status,data)=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  async function handler(url,init={}){
    const path=String(url).replace('https://discord.com/api/v10','');const method=init.method||'GET';
    const body=init.body?JSON.parse(init.body):null;calls.push({method,path,body});
    if(gone.has(path))return reply(404,{code:10008});
    if(method==='POST'&&path==='/channels/800000000000000004/threads')return reply(201,{id:String(next),message:{id:String(next++)}});
    if(method==='GET'&&path===`/guilds/${GUILD}/channels`)return reply(200,[{id:THREADS,name:'equipages',type:0,position:1},{id:'800000000000000004',name:'forum-equipages',type:15,position:4},{id:VOICES,name:'Vocaux',type:4,position:2},{id:'800000000000000003',name:'vocal',type:2,position:3}]);
    if(method==='GET'&&path===`/guilds/${GUILD}`)return reply(200,{id:GUILD,name:'Test',owner_id:ADMIN});
    if(method==='GET'&&path===`/guilds/${GUILD}/roles`)return reply(200,[{id:GUILD,name:'@everyone',permissions:'0',position:0}]);
    const voice=path.match(/^\/guilds\/\d+\/voice-states\/(\d+)$/);
    if(voice)return voiceStates.has(voice[1])?reply(200,{channel_id:voiceStates.get(voice[1])}):reply(404,{code:10065});
    if(method==='POST'||(method==='GET'))return reply(200,{id:String(next++)});
    return reply(method==='DELETE'?204:200,{});
  }
  return {calls,handler,voiceStates,gone};
}

function harness(){
  const DB=new D1();
  linkTestServer(DB.db, DEV);
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

test('a crew gets a thread and a voice channel, followed until 24 h after its race, with its reminders', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');
  // The admins choose the channel of the threads and the category of the voice channels.
  const setup=(await req('/api/community/setup','GET',null,'admin')).data;
  assert.deepEqual(setup.crews.channels.threads.map(item=>[item.id,item.forum]),[[THREADS,false],['800000000000000004',true]]);
  assert.match(setup.crews.botInviteUrl,/permissions=\d{12,}/);
  assert.equal((await req('/api/community/crew-discord','PUT',{enabled:true,reminders:true,threadChannelId:'999999999999999999'},'admin')).status,400);
  assert.equal((await req('/api/community/crew-discord','PUT',{enabled:true,reminders:true,threadChannelId:THREADS,voiceCategoryId:VOICES},'admin')).status,200);
  assert.equal((await req('/api/community/crew-discord','PUT',{enabled:true},'pilot')).status,403);

  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`, startsAt=departure.startsAt;
  const entry=await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot');assert.equal(entry.status,201);
  const mate=await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'mate');assert.equal(mate.status,201);
  const crew=await req(base+'/crews','POST',{name:'Les Tondeuz',category:'GT3'},'pilot');assert.equal(crew.status,201);

  // Too early: nothing on Discord.
  let mark=discord.calls.length;
  await sync(startsAt-OPEN_BEFORE-HOUR);
  assert.deepEqual(since(discord.calls,mark),[]);
  // A few days before: a voice channel in the category, a thread in the channel, the recap mentioning the pilot.
  mark=discord.calls.length;
  assert.equal((await sync(startsAt-3*24*HOUR)).opened,1);
  const opened=discord.calls.slice(mark);
  assert.deepEqual(opened.map(call=>`${call.method} ${call.path.replace(/\d{18}/g,'ID')}`),[`POST /guilds/ID/channels`,`POST /channels/ID/threads`,`POST /channels/ID/messages`]);
  assert.equal(opened[0].body.type,2);assert.equal(opened[0].body.parent_id,VOICES);assert.match(opened[0].body.name,/Les Tondeuz/);
  assert.equal(opened[1].path,`/channels/${THREADS}/threads`);assert.equal(opened[1].body.type,11);assert.match(opened[1].body.name,/Les Tondeuz · 6h SPA/);
  assert.match(opened[2].body.content,new RegExp(`<@${PILOT}>`));assert.deepEqual(opened[2].body.allowed_mentions,{users:[PILOT]});
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();
  assert.ok(row.thread_id&&row.voice_id&&row.message_id);
  assert.match(opened[2].body.content,new RegExp(`Salon vocal : <#${row.voice_id}>`));
  // Nothing changed: nothing sent.
  mark=discord.calls.length;await sync(startsAt-3*24*HOUR+HOUR);assert.deepEqual(since(discord.calls,mark),[]);

  // Bob joins and the crew gets a car: the recap is edited (without pinging) and Bob is welcomed in the thread.
  let crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:mate.data.id,version:crewRow.version,selfJoin:true},'mate')).status,200);
  crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}`,'PATCH',{name:'Les Tondeuz',category:'GT3',car:'Ferrari 296 LMGT3',version:crewRow.version},'pilot')).status,200);
  mark=discord.calls.length;await sync(startsAt-2*24*HOUR);
  const changed=discord.calls.slice(mark);
  assert.deepEqual(changed.map(call=>call.method),['PATCH','POST']);
  assert.equal(changed[0].path,`/channels/${row.thread_id}/messages/${row.message_id}`);assert.match(changed[0].body.content,/Ferrari 296 LMGT3/);assert.deepEqual(changed[0].body.allowed_mentions,{parse:[]});
  assert.match(changed[1].body.content,new RegExp(`Bienvenue <@${MATE}>`));assert.deepEqual(changed[1].body.allowed_mentions,{users:[MATE]});

  // 24 h before: a reminder in the thread and on the bell (with the thread); sent once.
  mark=discord.calls.length;await sync(startsAt-23*HOUR);
  const reminder=discord.calls.slice(mark).filter(call=>call.method==='POST');
  assert.equal(reminder.length,1);assert.match(reminder[0].body.content,/⏰ .*Rappel/);assert.deepEqual(reminder[0].body.allowed_mentions.users.sort(),[PILOT,MATE].sort());
  for(const actor of ['pilot','mate']){const item=(await notifications(req,actor)).find(item=>item.kind==='race_reminder');assert.ok(item,actor);assert.equal(item.crewName,'Les Tondeuz');assert.equal(item.threadUrl,`https://discord.com/channels/${GUILD}/${row.thread_id}`);}
  mark=discord.calls.length;await sync(startsAt-22*HOUR);assert.deepEqual(since(discord.calls,mark),[]);
  assert.equal((await notifications(req,'pilot')).filter(item=>item.kind==='race_reminder').length,1);
  // 1 h before: the last reminder, with the voice channel.
  mark=discord.calls.length;await sync(startsAt-30*60_000);
  assert.match(discord.calls.slice(mark).find(call=>call.method==='POST').body.content,new RegExp(`<#${row.voice_id}>`));

  // 24 h after the end: still a pilot in the voice channel, so it waits; then archived and deleted.
  const endsAt=startsAt+6*HOUR;
  discord.voiceStates.set(MATE,row.voice_id);
  mark=discord.calls.length;await sync(endsAt+CLOSE_AFTER+HOUR);
  assert.ok(!since(discord.calls,mark).some(call=>call.startsWith('DELETE')));
  assert.equal(DB.db.prepare('SELECT closed_at FROM crew_discord').get().closed_at,null);
  discord.voiceStates.clear();
  mark=discord.calls.length;assert.equal((await sync(endsAt+CLOSE_AFTER+2*HOUR)).closed,1);
  const closing=discord.calls.slice(mark).filter(call=>call.method!=='GET');
  assert.deepEqual(closing.map(call=>`${call.method} ${call.path}`),[`DELETE /channels/${row.voice_id}`,`PATCH /channels/${row.thread_id}`]);
  assert.deepEqual(closing[1].body,{archived:true,locked:true});
  mark=discord.calls.length;await sync(endsAt+CLOSE_AFTER+3*HOUR);assert.deepEqual(since(discord.calls,mark),[]);
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
  // Module on (without category): opened, then the crew is deleted: voice channel deleted and thread archived.
  assert.equal((await req('/api/community/crew-discord','PUT',{enabled:true,reminders:false,threadChannelId:THREADS},'admin')).status,200);
  assert.equal((await sync(departure.startsAt-2*HOUR)).opened,1);
  const voice=discord.calls.find(call=>call.path===`/guilds/${GUILD}/channels`&&call.method==='POST');assert.equal(voice.body.parent_id,undefined);
  const crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}`,'DELETE',{version:crewRow.version},'pilot')).status,200);
  const mark=discord.calls.length;assert.equal((await sync(departure.startsAt-HOUR)).closed,1);
  assert.deepEqual(discord.calls.slice(mark).map(call=>call.method),['DELETE','PATCH']);
  assert.ok(DB.db.prepare('SELECT closed_at FROM crew_discord').get().closed_at);
});

test('in a forum the recap opens the post; a recap deleted on Discord is posted again', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');
  assert.equal((await req('/api/community/crew-discord','PUT',{enabled:true,threadChannelId:'800000000000000004'},'admin')).status,200);
  assert.equal((await req('/api/events','POST',race,'admin')).status,201);
  const event=(await req('/api/events','GET',null,'admin')).data.events[0];
  const departure=event.departures[0], base=`/api/events/${event.id}/departures/${departure.id}`;
  assert.equal((await req(base+'/registrations','POST',{name:'x',category:'GT3',status:'whole'},'pilot')).status,201);
  assert.equal((await req(base+'/crews','POST',{name:'Forum',category:'GT3'},'pilot')).status,201);
  let mark=discord.calls.length;await sync(departure.startsAt-24*HOUR*2);
  const post=discord.calls.slice(mark).find(call=>call.path==='/channels/800000000000000004/threads');
  assert.equal(post.body.type,undefined);assert.match(post.body.message.content,new RegExp(`<@${PILOT}>`));
  assert.equal(discord.calls.slice(mark).filter(call=>call.path.endsWith('/messages')).length,0,'no second message');
  let row=DB.db.prepare('SELECT * FROM crew_discord').get();assert.ok(row.message_id);
  // Someone deletes the recap: it comes back at the next checks.
  discord.gone.add(`/channels/${row.thread_id}/messages/${row.message_id}`);
  DB.db.prepare("UPDATE crew_discord SET recap_hash='' ").run();
  await sync(departure.startsAt-24*HOUR*2+HOUR);
  assert.equal(DB.db.prepare('SELECT message_id FROM crew_discord').get().message_id,null);
  mark=discord.calls.length;await sync(departure.startsAt-24*HOUR*2+2*HOUR);
  assert.deepEqual(discord.calls.slice(mark).map(call=>`${call.method} ${call.path}`),[`POST /channels/${row.thread_id}/messages`]);
  assert.ok(DB.db.prepare('SELECT message_id FROM crew_discord').get().message_id);
});
