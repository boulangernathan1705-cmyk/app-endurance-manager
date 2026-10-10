import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {linkTestServer,DEV_COMMUNITY,GUILD} from './fixtures/discord-server.mjs';
import {syncWeeklyDiscord,recapTargets} from '../server/discord-weekly.mjs';
import {saveBotRecap,syncBotRecaps,previewBotRecap,recapDestinations,eventDeletionTime,eventChannelName,sendBotRecapTest} from '../server/recap-discord.mjs';

const OWNER='333333333333333333', BOT='444444444444444444', TEXT='555555555555555555', CATEGORY='666666666666666666';
const NOW=Date.parse('2026-10-10T12:00:00Z'), DAY=86400000;
const COMMUNITY={id:DEV_COMMUNITY,slug:'commu-dev',name:'Test',discordGuildId:GUILD,modules:{discordWeekly:true}};
const SETTINGS={mode:'events',scope:'all',destinationId:CATEGORY,destinationName:'Endurances'};
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())this.db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));linkTestServer(this.db);this.db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run(OWNER,'Admin');}
  prepare(sql){const db=this.db;return {params:[],bind(...params){this.params=params;return this;},async first(){return db.prepare(sql).get(...this.params)||null;},async all(){return {results:db.prepare(sql).all(...this.params)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.params).changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}
function setup(t,{rights='68624',overrides=[],failure=null}={}){
  const DB=new D1(),calls=[],channels=[{id:TEXT,type:0,name:'recap',permission_overwrites:overrides},{id:'111111111111111110',type:4,name:'Accueil',position:0},{id:CATEGORY,type:4,name:'Endurances',position:1,permission_overwrites:overrides},{id:'111111111111111112',type:4,name:'Vocaux',position:2}],messages=new Map();
  const env={DB,APP_ORIGIN:'https://site.example',DISCORD_CLIENT_ID:BOT,DISCORD_BOT_TOKEN:'fake',ADMIN_DISCORD_IDS:OWNER};
  let counter=900000000000000000n, fail=failure;
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const path=String(url).replace('https://discord.com/api/v10',''),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    calls.push({path,method,body});
    if(fail?.(path,method))return Response.json({code:50013},{status:fail.status||403});
    if(path===`/guilds/${GUILD}`)return Response.json({id:GUILD,name:'Test',owner_id:OWNER});
    if(path===`/guilds/${GUILD}/roles`)return Response.json([{id:GUILD,permissions:rights}]);
    if(path===`/guilds/${GUILD}/members/${BOT}`)return Response.json({roles:[]});
    if(path===`/guilds/${GUILD}/members/${OWNER}`)return Response.json({user:{id:OWNER},roles:[]});
    if(path===`/guilds/${GUILD}/channels`){
      if(method==='GET')return Response.json(channels);
      if(method==='PATCH'){for(const item of body)Object.assign(channels.find(channel=>channel.id===item.id),{position:item.position});return new Response(null,{status:204});}
      const channel={...body,id:String(counter++)};channels.push(channel);return Response.json(channel);
    }
    if(path.includes('/api/webhooks/'))return Response.json({id:String(counter++)});
    const list=path.match(/^\/channels\/(\d+)\/messages\?limit=100$/);
    if(list)return Response.json([...messages.values()].filter(item=>item.channel_id===list[1]).reverse());
    const send=path.match(/^\/channels\/(\d+)\/messages$/);
    if(send){const message={...body,id:String(counter++),channel_id:send[1],author:{id:BOT}};messages.set(message.id,message);return Response.json(message);}
    const edit=path.match(/^\/channels\/(\d+)\/messages\/(\d+)$/);
    if(edit){const message=messages.get(edit[2]);if(!message)return new Response('{}',{status:404});Object.assign(message,body);return Response.json(message);}
    const channel=path.match(/^\/channels\/(\d+)$/);
    if(channel){const index=channels.findIndex(item=>item.id===channel[1]);if(index<0)return new Response('{}',{status:404});if(method==='DELETE')channels.splice(index,1);else Object.assign(channels[index],body);return new Response(null,{status:204});}
    return new Response('{}',{status:404});
  };
  t.after(()=>globalThis.fetch=original);
  return {DB,env,calls,channels,messages,setFailure(value){fail=value;}};
}
function race(DB,id='race-a',name='6h de Spa',circuit='spa',departures=[{id:'start-a',startsAt:NOW+DAY}],community=DEV_COMMUNITY){
  DB.db.prepare(`INSERT INTO events(id,name,circuit,duration_hours,categories,departures,created_by,created_at,community_id) VALUES(?,?,?,6,'["GT3"]',?,?,0,?)`).run(id,name,circuit,JSON.stringify(departures),OWNER,community);
}
const written=calls=>calls.filter(item=>item.method!=='GET');
const creates=calls=>calls.filter(item=>item.method==='POST'&&item.path.endsWith('/channels'));
const sends=calls=>calls.filter(item=>item.method==='POST'&&item.path.endsWith('/messages'));

async function as(env,path,method='GET',input,user=OWNER){
  env.DB.db.prepare('INSERT OR IGNORE INTO users(id,name,created_at) VALUES(?,?,0)').run(user,'Utilisateur');
  const raw=user[0].repeat(64),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  env.DB.db.prepare('INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,4102444800)').run(digest,user);
  const response=await worker.fetch(new Request('https://site.example'+path,{method,headers:{Cookie:`__Host-em_session=${raw}`,Origin:'https://site.example','Content-Type':'application/json','CF-Connecting-IP':user},body:method==='GET'?undefined:JSON.stringify(input)}),env);
  return {status:response.status,data:await response.json()};
}

test('read-only previews preserve every departure and never send to Discord',async t=>{
  const {DB,env,calls}=setup(t);race(DB,'a','Même course','spa',[{id:'s1',startsAt:NOW+DAY},{id:'s2',startsAt:NOW+8*DAY}]);race(DB,'b','Même course','iracing-spa');
  const previews=await previewBotRecap(env,NOW,COMMUNITY,SETTINGS);
  assert.equal(previews.length,2);assert.notEqual(previews[0].name,previews[1].name);
  assert.match(JSON.stringify(previews[0].payload),/18 oct/,'also keeps the later departure of the same race');
  assert.equal(calls.length,0);
  assert.equal((await previewBotRecap(env,NOW,COMMUNITY,{...SETTINGS,scope:'lmu'})).length,1);
  assert.equal((await previewBotRecap(env,NOW,COMMUNITY,{...SETTINGS,scope:'iracing'})).length,1);
  assert.equal((await previewBotRecap(env,NOW,COMMUNITY,{...SETTINGS,mode:'general'})).length,1);
});

test('two homonymous events get a category each with their recap; edits reuse their single silent messages',async t=>{
  const {DB,env,calls,messages,channels}=setup(t);race(DB,'a','Même course');race(DB,'b','Même course','iracing-spa');
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncWeeklyDiscord(env,NOW,COMMUNITY);
  assert.deepEqual(creates(calls).map(call=>[call.body.type,call.body.name]),[[4,'🏎️ LMU · Même course'],[0,'récap'],[4,'🏁 iRacing · Même course'],[0,'récap']]);
  assert.equal(sends(calls).length,2);
  const [lmu,iracing]=creates(calls).filter(call=>call.body.type===4).map(call=>channels.find(item=>item.name===call.body.name).id);
  assert.deepEqual(creates(calls).filter(call=>call.body.type===0).map(call=>call.body.parent_id),[lmu,iracing]);
  // Right after the chosen category, in the order they were made; the next category stays below them.
  assert.deepEqual(channels.filter(item=>item.type===4).sort((a,b)=>a.position-b.position).map(item=>item.name),['Accueil','Endurances','🏎️ LMU · Même course','🏁 iRacing · Même course','Vocaux']);
  for(const call of sends(calls)){assert.deepEqual(call.body.allowed_mentions,{parse:[]});assert.equal(call.body.flags,4096);}
  calls.length=0;await syncWeeklyDiscord(env,NOW+1000,COMMUNITY);assert.equal(written(calls).length,0);
  DB.db.prepare("UPDATE events SET name='Spa actualisé' WHERE id='a'").run();
  await syncWeeklyDiscord(env,NOW+2000,COMMUNITY);assert.equal(sends(calls).length,0);assert.equal(creates(calls).length,0);
  assert.equal(calls.filter(call=>call.method==='PATCH').length,1);assert.equal(messages.size,2);
});

test('general mode uses an existing text channel and retains the message when filters/settings change',async t=>{
  const {DB,env,calls}=setup(t);race(DB);race(DB,'ir','iRacing','iracing-spa');
  const settings={...SETTINGS,mode:'general',destinationId:TEXT,destinationName:'recap'};
  await saveBotRecap(env,COMMUNITY,settings);await syncBotRecaps(env,NOW,COMMUNITY);
  assert.equal(creates(calls).length,0);assert.equal(sends(calls).length,1);assert.match(JSON.stringify(sends(calls)[0].body),/iRacing/);
  calls.length=0;await saveBotRecap(env,COMMUNITY,{...settings,scope:'lmu'});await syncBotRecaps(env,NOW,COMMUNITY);
  assert.equal(sends(calls).length,0);const patch=calls.find(call=>call.method==='PATCH');assert.ok(patch);assert.doesNotMatch(JSON.stringify(patch.body),/iRacing/);
  await syncBotRecaps(env,NOW+20*DAY,COMMUNITY);assert.equal(calls.filter(call=>call.method==='DELETE').length,0);
});

test('cleanup waits 24 hours after the FINAL departure, then deletes only the event text channel',async t=>{
  const {DB,env,calls}=setup(t);const start=NOW+DAY,last=NOW+3*DAY;race(DB,'a','Spa','spa',[{id:'a1',startsAt:start},{id:'a2',startsAt:last}]);
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);calls.length=0;
  const end=last+6*3600000;
  await syncBotRecaps(env,end+DAY-1,COMMUNITY);assert.equal(calls.filter(call=>call.method==='DELETE').length,0);
  await syncBotRecaps(env,end+DAY,COMMUNITY);assert.equal(calls.filter(call=>call.method==='DELETE').length,2,'the recap, then its race category');
  assert.ok(!calls.some(call=>call.method==='DELETE'&&call.path===`/channels/${CATEGORY}`));
  calls.length=0;await syncBotRecaps(env,end+2*DAY,COMMUNITY);assert.equal(written(calls).length,0);
  assert.ok(DB.db.prepare('SELECT closed_at FROM discord_recap_publications').get().closed_at);
});

test('unknown schedules prevent cleanup; changes to the end are recalculated; disabling keeps cleanup',async t=>{
  const {DB,env,calls}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  DB.db.prepare('UPDATE events SET schedule_pending=1').run();calls.length=0;
  await syncBotRecaps(env,NOW+10*DAY,COMMUNITY);assert.equal(calls.filter(call=>call.method==='DELETE').length,0);
  DB.db.prepare('UPDATE events SET schedule_pending=0,departures=?').run(JSON.stringify([{id:'s',startsAt:NOW+15*DAY}]));
  await syncBotRecaps(env,NOW+10*DAY,COMMUNITY);assert.equal(calls.filter(call=>call.method==='DELETE').length,0);
  DB.db.prepare('UPDATE community_recap_settings SET enabled=0').run();
  await syncBotRecaps(env,NOW+17*DAY,COMMUNITY);assert.equal(calls.filter(call=>call.method==='DELETE').length,2);
});

test('channels still expire after switching back to a general recap',async t=>{
  const {DB,env,calls}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  await saveBotRecap(env,COMMUNITY,{...SETTINGS,mode:'general',destinationId:TEXT,destinationName:'recap'});
  await syncBotRecaps(env,NOW+4*DAY,COMMUNITY);
  assert.equal(calls.filter(call=>call.method==='DELETE').length,2);assert.equal(sends(calls).length,2);
});

test('concurrent synchronizations share a lock and recover a channel/message after lost state',async t=>{
  const {DB,env,calls}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);
  await Promise.all([syncBotRecaps(env,NOW,COMMUNITY),syncBotRecaps(env,NOW,COMMUNITY)]);
  assert.equal(creates(calls).length,2);assert.equal(sends(calls).length,1);
  DB.db.prepare("UPDATE discord_recap_publications SET channel_id=NULL,message_id=NULL,content_hash=''").run();calls.length=0;
  await syncBotRecaps(env,NOW,COMMUNITY);assert.equal(creates(calls).length,0);assert.equal(sends(calls).length,0);
});

test('Discord failures are recorded and retried without duplicates; a removed message is not reposted',async t=>{
  const {DB,env,calls,messages,setFailure}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  DB.db.prepare("UPDATE events SET name='Changé'").run();const failure=(path,method)=>method==='PATCH';failure.status=429;setFailure(failure);
  await assert.rejects(syncBotRecaps(env,NOW,COMMUNITY),/limite/);assert.match(DB.db.prepare('SELECT last_error FROM community_recap_settings').get().last_error,/limite/);
  setFailure(null);calls.length=0;await syncBotRecaps(env,NOW,COMMUNITY);assert.equal(sends(calls).length,0);assert.equal(DB.db.prepare('SELECT last_error FROM community_recap_settings').get().last_error,null);
  messages.clear();DB.db.prepare("UPDATE events SET name='Encore changé'").run();
  await assert.rejects(syncBotRecaps(env,NOW,COMMUNITY),/introuvable/);assert.equal(sends(calls).length,0);
});

test('destination selection accounts for channel overwrites and keeps communities isolated',async t=>{
  const {env}=setup(t,{overrides:[{id:BOT,type:1,deny:'16',allow:'0'}]});
  const list=await recapDestinations(env,COMMUNITY);assert.equal(list.find(item=>item.type===0).ready,true);
  assert.deepEqual(list.find(item=>item.id===CATEGORY).missing,['Gérer les salons']);
  assert.equal((await as(env,'/api/community/recap','PUT',SETTINGS)).status,400);
  assert.equal((await as(env,'/api/community/recap','PUT',{...SETTINGS,mode:'general',destinationId:CATEGORY})).status,400);
  assert.equal((await as(env,'/api/community/recap','PUT',{...SETTINGS,destinationId:'999999999999999999'})).status,400);
  assert.equal((await as(env,'/api/community/recap/preview','POST',{...SETTINGS,scope:'none'})).status,400);
  assert.equal((await as(env,'/api/community/recap/destinations','GET',null,'222222222222222222')).status,403);
});

test('an explicit test reuses publications without activating automation or disabling legacy webhooks',async t=>{
  const {DB,env,calls}=setup(t);race(DB);const hook='https://discord.com/api/webhooks/123456789012345678/token-aaaaaaaaaaaaaaaaaaaaaaaa';
  DB.db.prepare("INSERT INTO community_recaps(community_id,scope,webhook_url,updated_at) VALUES(?,'all',?,0)").run(DEV_COMMUNITY,hook);
  await sendBotRecapTest(env,NOW,COMMUNITY,SETTINGS);
  assert.deepEqual({...DB.db.prepare('SELECT enabled,adopted FROM community_recap_settings').get()},{enabled:0,adopted:0});
  assert.equal((await recapTargets(env,COMMUNITY)).length,1);
  await saveBotRecap(env,COMMUNITY,SETTINGS);calls.length=0;await syncBotRecaps(env,NOW,COMMUNITY);
  assert.equal(sends(calls).length,0);assert.deepEqual(await recapTargets(env,COMMUNITY),[]);
});

test('API activation, preview and explicit test use the same messages; previews perform no writes',async t=>{
  const {DB,env,calls}=setup(t);race(DB,'a','Spa','spa',[{id:'s',startsAt:Date.now()+DAY}]);
  const preview=await as(env,'/api/community/recap/preview','POST',SETTINGS);assert.equal(preview.status,200);assert.equal(written(calls).length,0);
  const active=await as(env,'/api/community/recap','PUT',SETTINGS);assert.equal(active.status,200);assert.equal(active.data.published,true);
  const first=sends(calls).length;assert.equal((await as(env,'/api/community/recap/test','POST',SETTINGS)).status,200);assert.equal(sends(calls).length,first);
  const page=await as(env,'/api/community/setup');assert.equal(page.data.botRecap.mode,'events');assert.equal(page.data.botRecap.enabled,true);
  assert.equal((await as(env,'/api/community/recap','PUT',{enabled:false})).status,200);
});

test('event channels contain only this community’s crews and absences even on shared official races',async t=>{
  const {DB,env}=setup(t);
  DB.db.prepare("INSERT INTO communities(id,slug,name,short_name,created_at) VALUES('other','other','Other','OTH',0)").run();
  race(DB,'own','Own');race(DB,'foreign','Other secret','spa',undefined,'other');race(DB,'official-race','Shared','spa',undefined,'official');
  DB.db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run('other-user','Foreign secret');
  DB.db.prepare('INSERT INTO event_absences(event_id,user_id,community_id,created_at) VALUES(?,?,?,0)').run('official-race',OWNER,DEV_COMMUNITY);
  DB.db.prepare('INSERT INTO event_absences(event_id,user_id,community_id,created_at) VALUES(?,?,?,0)').run('official-race','other-user','other');
  const previews=await previewBotRecap(env,NOW,COMMUNITY,SETTINGS);const text=JSON.stringify(previews);
  assert.equal(previews.length,2);assert.match(text,/Admin/);assert.doesNotMatch(text,/Foreign secret|Other secret/);
  assert.match(text,/Pilotes absents/);
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  DB.db.prepare('DELETE FROM event_absences WHERE community_id=?').run(DEV_COMMUNITY);
  assert.doesNotMatch(JSON.stringify(await previewBotRecap(env,NOW,COMMUNITY,SETTINGS)),/Pilotes absents/);
});

test('cleanup respects duration minutes and pending starts; names obey Discord length limits',()=>{
  const event={departures:JSON.stringify([{startsAt:NOW},{startsAt:NOW+DAY}]),duration_hours:6,duration_minutes:90};
  assert.equal(eventDeletionTime(event),NOW+2*DAY+90*60000);
  assert.equal(eventDeletionTime({...event,departures:JSON.stringify([{startsAt:NOW,tbd:true}])}),null);
  assert.equal(eventDeletionTime({...event,duration_minutes:0,duration_hours:0}),null);
  assert.ok(eventChannelName('Événement '.repeat(30),'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee').length<=100);
});

test('quarter-hour cleanup rechecks current event times, works while disabled and leaves unknown schedules alone',async t=>{
  const {cleanupEventRecaps}=await import('../server/recap-discord.mjs');
  const {DB,env,calls}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  DB.db.prepare('UPDATE community_recap_settings SET enabled=0').run();
  DB.db.prepare('UPDATE events SET departures=?').run(JSON.stringify([{id:'s',startsAt:NOW+10*DAY}]));
  assert.equal(await cleanupEventRecaps(env,NOW+4*DAY),0,'postponed event remains');
  DB.db.prepare('UPDATE events SET schedule_pending=1').run();assert.equal(await cleanupEventRecaps(env,NOW+20*DAY),0);
  DB.db.prepare('UPDATE events SET schedule_pending=0').run();assert.equal(await cleanupEventRecaps(env,NOW+20*DAY),1);
  assert.equal(await cleanupEventRecaps(env,NOW+21*DAY),0);assert.equal(calls.filter(call=>call.method==='DELETE').length,2);
});

test('a manually deleted event keeps its channel until its last known end plus 24 hours',async t=>{
  const {cleanupEventRecaps}=await import('../server/recap-discord.mjs');
  const {DB,env}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  DB.db.prepare('DELETE FROM events').run();
  assert.equal(await cleanupEventRecaps(env,NOW),0);assert.equal(await cleanupEventRecaps(env,NOW+3*DAY),1);
});

test('new eligible races are created automatically; changing the chosen category leaves open races in place',async t=>{
  const {DB,env,calls,channels}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);calls.length=0;
  race(DB,'new-event','Nouvelle course');await syncBotRecaps(env,NOW+1000,COMMUNITY);assert.equal(creates(calls).length,2);
  channels.push({id:'777777777777777777',type:4,name:'Nouvelle catégorie',position:9});
  await saveBotRecap(env,COMMUNITY,{...SETTINGS,destinationId:'777777777777777777'});calls.length=0;
  await syncBotRecaps(env,NOW+2000,COMMUNITY);assert.equal(creates(calls).length,0);assert.equal(sends(calls).length,0);
  assert.equal(calls.filter(call=>call.method==='PATCH').length,0);
});

test('a recap channel made by the first version moves into its new race category, message kept',async t=>{
  const {DB,env,calls,channels,messages}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);
  channels.push({id:'888888888888888888',type:0,name:'6h-de-spa-1234',parent_id:CATEGORY});
  messages.set('999999999999999999',{id:'999999999999999999',channel_id:'888888888888888888',author:{id:BOT}});
  DB.db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,category_id,channel_id,message_id,marker,content_hash) VALUES(?,?,?,?,?,?,?,?)")
    .run(DEV_COMMUNITY,'race-a',GUILD,CATEGORY,'888888888888888888','999999999999999999','endurance-manager:old','old');
  await syncBotRecaps(env,NOW,COMMUNITY);
  assert.deepEqual(creates(calls).map(call=>call.body.type),[4]);
  const category=DB.db.prepare('SELECT category_id FROM discord_recap_publications').get().category_id;
  assert.notEqual(category,CATEGORY);assert.equal(channels.find(item=>item.id==='888888888888888888').parent_id,category);
  assert.equal(sends(calls).length,0);
});

test('large recaps remain within every Discord embed limit and retain a link to full details',async t=>{
  const {buildWeeklyDiscordPayload}=await import('../server/discord-weekly-format.mjs');
  const departures=Array.from({length:180},(_,i)=>({eventId:'event-'+Math.floor(i/20),eventName:'Endurance '+('x'.repeat(250)),eventType:'lmu',circuit:'spa',durationMinutes:360,startsAt:NOW+i*3600000,departureId:'start-'+i,
    crews:[{name:'Équipe '+i,category:'GT3',car:'Voiture',locked:false,pilots:Array(12).fill('Un pilote avec un nom très long')}],unassignedPilots:['Libre'],absentPilots:['Absent']}));
  const payload=buildWeeklyDiscordPayload({currentDepartures:[],futureDepartures:departures,periodLabel:'Semaine'}, {url:'https://site.example',name:'Communauté'},NOW,'all');
  assert.ok(payload.embeds.length<=10);
  const total=payload.embeds.reduce((sum,embed)=>sum+[embed.title,embed.description,embed.author?.name,embed.footer?.text,...(embed.fields||[]).flatMap(field=>[field.name,field.value])].reduce((n,item)=>n+String(item||'').length,0),0);
  assert.ok(total<=6000,`Discord length: ${total}`);
  for(const embed of payload.embeds){assert.ok((embed.description||'').length<=4096);assert.ok((embed.fields||[]).length<=25);for(const field of embed.fields||[])assert.ok(field.value.length<=1024);}
  assert.match(JSON.stringify(payload),/https:\/\/site.example/);assert.deepEqual(payload.allowed_mentions,{parse:[]});
});

test('configuration changes use the publication lock even on first setup',async t=>{
  const {DB,env}=setup(t);
  const results=await Promise.allSettled([saveBotRecap(env,COMMUNITY,SETTINGS),saveBotRecap(env,COMMUNITY,{...SETTINGS,scope:'lmu'})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.status,409);
  DB.db.prepare('UPDATE community_recap_settings SET lock_until=?').run(Date.now()+60000);
  assert.equal((await as(env,'/api/community/recap','PUT',SETTINGS)).status,409);
});

test('absence declarations and withdrawals edit only the existing event message',async t=>{
  const {DB,env,calls,messages}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);calls.length=0;
  DB.db.prepare('INSERT INTO event_absences(event_id,user_id,community_id,created_at) VALUES(?,?,?,0)').run('race-a',OWNER,DEV_COMMUNITY);
  await syncBotRecaps(env,NOW,COMMUNITY);assert.equal(sends(calls).length,0);assert.match(JSON.stringify([...messages.values()]),/Pilotes absents/);
  DB.db.prepare('DELETE FROM event_absences').run();await syncBotRecaps(env,NOW,COMMUNITY);
  assert.doesNotMatch(JSON.stringify([...messages.values()]),/Pilotes absents/);assert.equal(calls.filter(call=>call.method==='PATCH').length,2);
});

test('scheduled rotation compares bot and legacy timestamps in the same unit',async t=>{
  const {syncDueRecaps}=await import('../server/discord-weekly.mjs');
  const {DB,env,calls}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,{...SETTINGS,mode:'general',destinationId:TEXT});
  DB.db.prepare('UPDATE community_recap_settings SET checked_at=?').run(NOW-2000);
  DB.db.prepare("INSERT INTO communities(id,slug,name,short_name,created_at) VALUES('legacy','legacy','Legacy','LEG',0)").run();
  DB.db.prepare("INSERT INTO community_recaps(community_id,scope,webhook_url,updated_at) VALUES('legacy','all','https://discord.com/api/webhooks/123456789012345678/token-aaaaaaaaaaaaaaaaaaaaaaaa',0)").run();
  DB.db.prepare("INSERT INTO discord_weekly_state(key,message_id,content_hash,week_key,updated_at,community_id) VALUES('legacy:all-weekly-v1','','','',?,'legacy')").run(NOW/1000-1);
  assert.equal(await syncDueRecaps(env,1,NOW),1);assert.equal(sends(calls).length,1,'the older bot recap is processed before the newer legacy recap');
  assert.ok(calls.every(call=>!call.path.includes('/webhooks/')));
});

test('a race gets its category 6 days before its start, as the crews\' voice channels, whatever the week',async t=>{
  const {DB,env,calls}=setup(t);
  race(DB,'sunday','Dimanche','spa',[{id:'s',startsAt:NOW+DAY}]);race(DB,'thursday','Jeudi suivant','spa',[{id:'t',startsAt:NOW+5*DAY}]);race(DB,'later','Plus tard','spa',[{id:'l',startsAt:NOW+7*DAY}]);
  assert.deepEqual((await previewBotRecap(env,NOW,COMMUNITY,SETTINGS)).map(item=>item.name),['🏎️ LMU · Dimanche','🏎️ LMU · Jeudi suivant']);
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  assert.deepEqual(creates(calls).filter(call=>call.body.type===4).map(call=>call.body.name),['🏎️ LMU · Dimanche','🏎️ LMU · Jeudi suivant']);
  calls.length=0;await syncBotRecaps(env,NOW+DAY+3600000,COMMUNITY);
  assert.deepEqual(creates(calls).filter(call=>call.body.type===4).map(call=>call.body.name),['🏎️ LMU · Plus tard']);
});

test('a race far away gets its category as soon as it has a crew, even an empty one',async t=>{
  const {DB,env,calls}=setup(t);race(DB,'far','Dans un mois','spa',[{id:'f',startsAt:NOW+30*DAY}]);
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);assert.equal(creates(calls).length,0);
  DB.db.prepare("INSERT INTO crews(id,event_id,departure_id,name,category,car,locked,created_at,community_id) VALUES('crew','far','f','Équipe','GT3','',0,0,?)").run(DEV_COMMUNITY);
  await syncBotRecaps(env,NOW+1000,COMMUNITY);
  assert.deepEqual(creates(calls).map(call=>call.body.name),['🏎️ LMU · Dans un mois','récap']);
});

test('official races where the community has nothing never hold back the recap of the race it has a crew in',async t=>{
  const {DB,env,calls,messages}=setup(t);
  for(const id of ['o1','o2','o3'])race(DB,id,'Officielle '+id,'iracing-spa',[{id:'s-'+id,startsAt:NOW+DAY}],'official');
  race(DB,'mine','10h officielle','spa',[{id:'m',startsAt:NOW+2*DAY}],'official');
  DB.db.prepare("INSERT INTO crews(id,event_id,departure_id,name,category,car,locked,created_at,community_id) VALUES('crew','mine','m','Les plots','GT3','',0,0,?)").run(DEV_COMMUNITY);
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  assert.deepEqual(creates(calls).map(call=>call.body.name),['🏎️ LMU · 10h officielle','récap'],'only the race with a crew');
  DB.db.prepare('UPDATE crews SET name=? WHERE id=?').run('Les plots 2','crew');
  calls.length=0;await syncBotRecaps(env,NOW+1000,COMMUNITY);await syncBotRecaps(env,NOW+2000,COMMUNITY);
  assert.equal(calls.filter(call=>call.method==='PATCH').length,1);
  assert.match(JSON.stringify([...messages.values()]),/Les plots 2/);
});
