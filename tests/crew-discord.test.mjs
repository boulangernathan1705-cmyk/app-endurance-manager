import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {syncCrewDiscord, OPEN_BEFORE, CLOSE_AFTER, KEEP_ARCHIVES} from '../server/crew-discord.mjs';
import {linkTestServer, allowCrews, setMember, ORGA_ROLE, GUILD} from './fixtures/discord-server.mjs';

// Crews on Discord and race reminders (migrations 0044, 0045): the bot is a fake Discord that records each request.
const ROOT='https://site.example';
const ADMIN='111111111111111111', PILOT='222222222222222222', MATE='333333333333333333';
const DEV='e0a1c0de-0000-4000-8000-000000000001';
const BOT_ROLE='900000000000000009';
const HOUR=3600_000;
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();

class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}

// Fake Discord: every request is kept; new channels, threads and messages get new ids.
function fakeDiscord(){
  const calls=[];const state={botRights:true};let next=700000000000000000n;const voiceStates=new Map();const gone=new Set();const unknownChannel=new Set();
  const reply=(status,data)=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  async function handler(url,init={}){
    const path=String(url).replace('https://discord.com/api/v10','');const method=init.method||'GET';
    const body=init.body?JSON.parse(init.body):null;calls.push({method,path,body});
    if(unknownChannel.has(path))return reply(404,{code:10003});
    if(gone.has(path))return reply(404,{code:10008});
    if(method==='GET'&&path===`/guilds/${GUILD}/members/app-id`)return reply(200,{roles:[BOT_ROLE]});
    if(method==='GET'&&path===`/guilds/${GUILD}`)return reply(200,{id:GUILD,name:'Test',owner_id:ADMIN});
    if(method==='GET'&&path===`/guilds/${GUILD}/roles`)return reply(200,[{id:GUILD,name:'@everyone',permissions:'0',position:0},{id:BOT_ROLE,name:'Endurance Manager',permissions:state.botRights?'68624':'0',position:1}]);
    const voice=path.match(/^\/guilds\/\d+\/voice-states\/(\d+)$/);
    if(voice)return voiceStates.has(voice[1])?reply(200,{channel_id:voiceStates.get(voice[1])}):reply(404,{code:10065});
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

test('a crew gets its category with a text channel and its voice channel below, followed until 24 h after its race', async () => {
  const {DB,req,login,sync,discord}=harness();
  await login(ADMIN,'admin','Orga');await login(PILOT,'pilot','Alice');await login(MATE,'mate','Bob');
  // The admins turn the modules on in the settings, once the bot has the rights to make channels.
  discord.state.botRights=false;
  let settings=(await req('/api/community/settings','GET',null,'admin')).data;
  assert.equal(settings.crews.botReady,false);assert.match(settings.crews.botInviteUrl,/permissions=68624&/);
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,400);
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

  // Too early: nothing on Discord.
  let mark=discord.calls.length;
  await sync(startsAt-OPEN_BEFORE-HOUR);
  assert.deepEqual(since(discord.calls,mark),[]);
  // A few days before: its category, the text channel, the voice channel below, the recap mentioning the pilot.
  mark=discord.calls.length;
  assert.equal((await sync(startsAt-3*24*HOUR)).opened,1);
  const [category,text,voice]=created(discord.calls,mark);
  assert.deepEqual([category.body.type,text.body.type,voice.body.type],[4,0,2]);
  assert.match(category.body.name,/🏁 Les Tondeuz · 6h SPA/);
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();
  assert.ok(row.category_id&&row.text_id&&row.voice_id&&row.message_id);
  assert.equal(text.body.parent_id,row.category_id);assert.equal(voice.body.parent_id,row.category_id);
  const recap=discord.calls.slice(mark).find(call=>call.path===`/channels/${row.text_id}/messages`);
  assert.match(recap.body.content,new RegExp(`<@${PILOT}>`));assert.deepEqual(recap.body.allowed_mentions,{users:[PILOT]});
  assert.match(recap.body.content,new RegExp(`Salon vocal : <#${row.voice_id}>`));
  // Nothing changed: nothing sent.
  mark=discord.calls.length;await sync(startsAt-3*24*HOUR+HOUR);assert.deepEqual(since(discord.calls,mark),[]);

  // Bob joins and the crew gets a car: the recap is edited (without pinging) and Bob is welcomed.
  let crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}/members`,'POST',{registrationId:mate.data.id,version:crewRow.version,selfJoin:true},'mate')).status,200);
  crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}`,'PATCH',{name:'Les Tondeuz',category:'GT3',car:'Ferrari 296 LMGT3',version:crewRow.version},'pilot')).status,200);
  mark=discord.calls.length;await sync(startsAt-2*24*HOUR);
  const changed=discord.calls.slice(mark);
  assert.deepEqual(changed.map(call=>call.method),['PATCH','POST']);
  assert.equal(changed[0].path,`/channels/${row.text_id}/messages/${row.message_id}`);assert.match(changed[0].body.content,/Ferrari 296 LMGT3/);assert.deepEqual(changed[0].body.allowed_mentions,{parse:[]});
  assert.match(changed[1].body.content,new RegExp(`Bienvenue <@${MATE}>`));assert.deepEqual(changed[1].body.allowed_mentions,{users:[MATE]});

  // 24 h before: a reminder in the text channel and on the bell (with the channel); sent once.
  mark=discord.calls.length;await sync(startsAt-23*HOUR);
  const reminder=discord.calls.slice(mark).filter(call=>call.method==='POST');
  assert.equal(reminder.length,1);assert.equal(reminder[0].path,`/channels/${row.text_id}/messages`);assert.match(reminder[0].body.content,/⏰ .*Rappel/);
  assert.deepEqual(reminder[0].body.allowed_mentions.users.sort(),[PILOT,MATE].sort());
  for(const actor of ['pilot','mate']){const item=(await notifications(req,actor)).find(item=>item.kind==='race_reminder');assert.ok(item,actor);assert.equal(item.crewName,'Les Tondeuz');assert.equal(item.channelUrl,`https://discord.com/channels/${GUILD}/${row.text_id}`);}
  mark=discord.calls.length;await sync(startsAt-22*HOUR);assert.deepEqual(since(discord.calls,mark),[]);
  assert.equal((await notifications(req,'pilot')).filter(item=>item.kind==='race_reminder').length,1);
  // 1 h before: the last reminder, with the voice channel.
  mark=discord.calls.length;await sync(startsAt-30*60_000);
  assert.match(discord.calls.slice(mark).find(call=>call.method==='POST').body.content,new RegExp(`<#${row.voice_id}>`));

  // 24 h after the end: still a pilot in the voice channel, so it waits; then the voice channel is deleted, the
  // bot makes the read-only « Archives équipages » category, the text channel goes there with its permissions,
  // and the crew's category is deleted.
  const endsAt=startsAt+6*HOUR;
  discord.voiceStates.set(MATE,row.voice_id);
  mark=discord.calls.length;await sync(endsAt+CLOSE_AFTER+HOUR);
  assert.ok(!since(discord.calls,mark).some(call=>call.startsWith('DELETE')));
  assert.equal(DB.db.prepare('SELECT closed_at FROM crew_discord').get().closed_at,null);
  discord.voiceStates.clear();
  mark=discord.calls.length;assert.equal((await sync(endsAt+CLOSE_AFTER+2*HOUR)).closed,1);
  const closing=discord.calls.slice(mark).filter(call=>call.method!=='GET');
  assert.deepEqual(closing.map(call=>`${call.method} ${call.path}`),[`DELETE /channels/${row.voice_id}`,`POST /guilds/${GUILD}/channels`,`PATCH /channels/${row.text_id}`,`DELETE /channels/${row.category_id}`]);
  assert.equal(closing[1].body.type,4);assert.deepEqual(closing[1].body.permission_overwrites,[{id:GUILD,type:0,allow:'0',deny:'2048'}]);
  const archives=DB.db.prepare('SELECT archive_category_id FROM community_crew_discord').get().archive_category_id;
  assert.ok(archives);assert.deepEqual(closing[2].body,{parent_id:archives,lock_permissions:true});
  mark=discord.calls.length;await sync(endsAt+CLOSE_AFTER+3*HOUR);assert.deepEqual(since(discord.calls,mark),[]);
  // 30 days later, the archived text channel is deleted.
  mark=discord.calls.length;assert.equal((await sync(endsAt+CLOSE_AFTER+2*HOUR+KEEP_ARCHIVES+HOUR)).purged,1);
  assert.deepEqual(since(discord.calls,mark),[`DELETE /channels/${row.text_id}`]);
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
  // Module on: opened, then the crew is deleted: everything is deleted, nothing archived.
  assert.equal((await req('/api/community/modules','PATCH',{crewChannels:true},'admin')).status,200);
  assert.equal((await sync(departure.startsAt-2*HOUR)).opened,1);
  const row=DB.db.prepare('SELECT * FROM crew_discord').get();
  const crewRow=(await req('/api/events','GET',null,'pilot')).data.events[0].departures[0].crews[0];
  assert.equal((await req(`/api/crews/${crew.data.id}`,'DELETE',{version:crewRow.version},'pilot')).status,200);
  const mark=discord.calls.length;assert.equal((await sync(departure.startsAt-HOUR)).closed,1);
  assert.deepEqual(since(discord.calls,mark),[`DELETE /channels/${row.voice_id}`,`DELETE /channels/${row.text_id}`,`DELETE /channels/${row.category_id}`]);
  const closed=DB.db.prepare('SELECT * FROM crew_discord').get();
  assert.ok(closed.closed_at);assert.equal(closed.archived_id,null);
});

test('a recap or a text channel deleted on Discord is made again', async () => {
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
  discord.gone.add(`/channels/${row.text_id}/messages/${row.message_id}`);
  DB.db.prepare("UPDATE crew_discord SET recap_hash=''").run();
  await sync(at+HOUR);
  assert.equal(DB.db.prepare('SELECT message_id FROM crew_discord').get().message_id,null);
  let mark=discord.calls.length;await sync(at+2*HOUR);
  assert.deepEqual(since(discord.calls,mark),[`POST /channels/${row.text_id}/messages`]);
  // Someone deletes the text channel: a new one in the same category, with the recap.
  const now=DB.db.prepare('SELECT * FROM crew_discord').get();
  discord.gone.add(`/channels/${row.text_id}/messages/${now.message_id}`);
  discord.unknownChannel.add(`/channels/${row.text_id}/messages/${now.message_id}`);
  DB.db.prepare("UPDATE crew_discord SET recap_hash=''").run();
  await sync(at+3*HOUR);
  assert.equal(DB.db.prepare('SELECT text_id FROM crew_discord').get().text_id,null);
  mark=discord.calls.length;await sync(at+4*HOUR);
  const again=discord.calls.slice(mark);
  assert.equal(again[0].body.type,0);assert.equal(again[0].body.parent_id,row.category_id);
  assert.equal(again[1].method,'POST');assert.match(again[1].path,/\/messages$/);
});
