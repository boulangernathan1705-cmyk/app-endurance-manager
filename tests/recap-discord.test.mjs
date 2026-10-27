import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {linkTestServer,DEV_COMMUNITY,GUILD} from './fixtures/discord-server.mjs';
import {syncWeeklyDiscord} from '../server/discord-weekly.mjs';
import {botCategoryEmojis,saveBotRecap,syncBotRecaps,previewBotRecap,recapDestinations,eventDeletionTime,eventChannelName,settingsRow,recapError,repairBotRecap,racesOpenNow} from '../server/recap-discord.mjs';

const OWNER='333333333333333333', BOT='444444444444444444', TEXT='555555555555555555', CATEGORY='666666666666666666';
const NOW=Date.parse('2026-10-10T12:00:00Z'), DAY=86400000;
const COMMUNITY={id:DEV_COMMUNITY,slug:'commu-dev',name:'Test',discordGuildId:GUILD,modules:{discordWeekly:true}};
const ENDURANCES={id:CATEGORY,name:'Endurances'}, RECAP={id:TEXT,name:'recap'};
const SETTINGS=settingsRow('events',ENDURANCES,ENDURANCES), GENERAL=settingsRow('general',RECAP);
const INPUT={mode:'events',lmuId:CATEGORY,iracingId:CATEGORY};
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())this.db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));linkTestServer(this.db);this.db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run(OWNER,'Admin');}
  prepare(sql){const db=this.db;return {params:[],bind(...params){this.params=params;return this;},async first(){return db.prepare(sql).get(...this.params)||null;},async all(){return {results:db.prepare(sql).all(...this.params)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.params).changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}
function setup(t,{rights='85008',overrides=[],failure=null}={}){
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
    if(edit){const message=messages.get(edit[2]);if(!message)return Response.json({code:10008},{status:404});if(method==='DELETE'){messages.delete(edit[2]);return new Response(null,{status:204});}Object.assign(message,body);return Response.json(message);}
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
  assert.equal((await previewBotRecap(env,NOW,COMMUNITY,settingsRow('events',ENDURANCES))).length,1);
  assert.equal((await previewBotRecap(env,NOW,COMMUNITY,settingsRow('events',{},ENDURANCES))).length,1);
  const weekly=await previewBotRecap(env,NOW,COMMUNITY,settingsRow('general',RECAP,RECAP));
  assert.deepEqual(weekly.map(item=>item.name),['recap · Endurances LMU','recap · Endurances iRacing'],'one message per sim');
  assert.equal(calls.length,0);
});

test('two homonymous events get a category each with their recap; edits reuse their single silent messages',async t=>{
  const {DB,env,calls,messages,channels}=setup(t);race(DB,'a','Même course');race(DB,'b','Même course','iracing-spa');
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncWeeklyDiscord(env,NOW,COMMUNITY);
  assert.deepEqual(creates(calls).map(call=>[call.body.type,call.body.name]),[[4,'🏎️ LMU · Même course'],[0,'infos-de-la-course'],[4,'🏁 iRacing · Même course'],[0,'infos-de-la-course']]);
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

test('below a chosen text channel the bot makes its own week channel, one message per sim, and takes down the one no longer wanted',async t=>{
  const {DB,env,calls,messages,channels}=setup(t);race(DB);race(DB,'ir','iRacing','iracing-spa');
  Object.assign(channels.find(item=>item.id===TEXT),{parent_id:CATEGORY,position:0});channels.push({id:'555555555555555556',type:0,name:'discussions',parent_id:CATEGORY,position:1});
  await saveBotRecap(env,COMMUNITY,settingsRow('general',RECAP,RECAP));await syncBotRecaps(env,NOW,COMMUNITY);
  assert.deepEqual(creates(calls).map(call=>[call.body.name,call.body.parent_id]),[['récap-de-la-semaine',CATEGORY]]);
  const made=channels.find(item=>item.name==='récap-de-la-semaine');
  assert.deepEqual(channels.filter(item=>item.parent_id===CATEGORY).sort((a,b)=>a.position-b.position).map(item=>item.name),['recap','récap-de-la-semaine','discussions'],'just below the chosen channel');
  assert.equal(sends(calls).length,2);assert.ok(sends(calls).every(call=>call.path===`/channels/${made.id}/messages`));
  assert.match(JSON.stringify(sends(calls)[0].body),/Endurances LMU/);assert.doesNotMatch(JSON.stringify(sends(calls)[0].body),/iRacing ·/);
  assert.match(JSON.stringify(sends(calls)[1].body),/Endurances iRacing/);
  calls.length=0;await saveBotRecap(env,COMMUNITY,GENERAL);await syncBotRecaps(env,NOW,COMMUNITY);
  assert.equal(sends(calls).length,0);assert.deepEqual(calls.filter(call=>call.method==='DELETE').map(call=>call.path.split('/').length),[5],'only the iRacing message goes');
  assert.equal(messages.size,1);
  calls.length=0;await syncBotRecaps(env,NOW+20*DAY,COMMUNITY);assert.equal(calls.filter(call=>call.method==='DELETE').length,0);
});

test('a recap posted straight into a channel by the previous version moves to the bot’s own channel below it',async t=>{
  const {DB,env,calls,messages}=setup(t);race(DB);
  messages.set('999999999999999990',{id:'999999999999999990',channel_id:TEXT,author:{id:BOT}});
  DB.db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,channel_id,message_id,marker,content_hash) VALUES(?,'week:lmu',?,?,'999999999999999990','endurance-manager:old','old')").run(DEV_COMMUNITY,GUILD,TEXT);
  await saveBotRecap(env,COMMUNITY,GENERAL);await syncBotRecaps(env,NOW,COMMUNITY);
  assert.ok(calls.some(call=>call.method==='DELETE'&&call.path===`/channels/${TEXT}/messages/999999999999999990`));
  assert.ok(!calls.some(call=>call.method==='DELETE'&&call.path===`/channels/${TEXT}`),'the admins’ channel stays');
  assert.equal(creates(calls).length,1);assert.equal(sends(calls).length,1);
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
  await saveBotRecap(env,COMMUNITY,GENERAL);
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
  await assert.rejects(syncBotRecaps(env,NOW,COMMUNITY),/message de récap a été supprimé/);assert.equal(sends(calls).length,0);
});

test('destination selection accounts for channel overwrites and keeps communities isolated',async t=>{
  const {env}=setup(t,{overrides:[{id:BOT,type:1,deny:'16',allow:'0'}]});
  const list=await recapDestinations(env,COMMUNITY);assert.equal(list.find(item=>item.type===0).ready,true);
  assert.deepEqual(list.find(item=>item.id===CATEGORY).missing,['Gérer les salons']);
  assert.equal((await as(env,'/api/community/discord','PUT',INPUT)).status,400);
  assert.equal((await as(env,'/api/community/discord','PUT',{mode:'general',lmuId:CATEGORY})).status,400);
  assert.equal((await as(env,'/api/community/discord','PUT',{...INPUT,lmuId:'999999999999999999'})).status,400);
  assert.equal((await as(env,'/api/community/recap/preview','POST',{mode:'events'})).status,400);
  assert.equal((await as(env,'/api/community/recap/destinations','GET',null,'222222222222222222')).status,403);
});

test('historical webhooks stay inert; a community without setup sees the recap off',async t=>{
  const {DB,env,calls}=setup(t);race(DB);const hook='https://discord.com/api/webhooks/123456789012345678/token-aaaaaaaaaaaaaaaaaaaaaaaa';
  DB.db.prepare("INSERT INTO community_recaps(community_id,scope,webhook_url,updated_at) VALUES(?,'all',?,0)").run(DEV_COMMUNITY,hook);
  const page=(await as(env,'/api/community/setup')).data;
  assert.equal(page.botRecap,null);assert.equal(page.recapSetupRequired,true);
  assert.match(page.recapBotInviteUrl,/permissions=85008&/);
  calls.length=0;await syncWeeklyDiscord(env,NOW,COMMUNITY);assert.equal(sends(calls).length,0);assert.ok(calls.every(call=>!call.path.includes('/webhooks/')));
  await saveBotRecap(env,COMMUNITY,SETTINGS,false);calls.length=0;await syncBotRecaps(env,NOW,COMMUNITY);
  assert.equal(sends(calls).length,0);assert.ok(calls.every(call=>!call.path.includes('/webhooks/')));
});

test('API activation and preview use the same messages; previews perform no writes',async t=>{
  const {DB,env,calls}=setup(t);race(DB,'a','Spa','spa',[{id:'s',startsAt:Date.now()+DAY}]);
  const preview=await as(env,'/api/community/recap/preview','POST',INPUT);assert.equal(preview.status,200);assert.equal(written(calls).length,0);
  const active=await as(env,'/api/community/discord','PUT',INPUT);assert.equal(active.status,200);assert.equal(active.data.published,true);
  const page=await as(env,'/api/community/setup');assert.equal(page.data.botRecap.mode,'events');assert.equal(page.data.botRecap.enabled,true);
  assert.equal((await as(env,'/api/community/discord','PUT',{enabled:false})).status,200);
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

test('new eligible races are created automatically; changing the anchor reorders without recreating channels',async t=>{
  const {DB,env,calls,channels}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);calls.length=0;
  race(DB,'new-event','Nouvelle course');await syncBotRecaps(env,NOW+1000,COMMUNITY);assert.equal(creates(calls).length,2);
  channels.push({id:'777777777777777777',type:4,name:'Nouvelle catégorie',position:9});
  await saveBotRecap(env,COMMUNITY,settingsRow('events',{id:'777777777777777777',name:'Nouvelle catégorie'},{id:'777777777777777777',name:'Nouvelle catégorie'}));calls.length=0;
  await syncBotRecaps(env,NOW+2000,COMMUNITY);assert.equal(creates(calls).length,0);assert.equal(sends(calls).length,0);
  assert.equal(calls.filter(call=>call.method==='PATCH'&&call.path===`/guilds/${GUILD}/channels`).length,1);
  assert.equal(calls.filter(call=>call.method==='PATCH'&&call.path.startsWith('/channels/')).length,0);
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
  const results=await Promise.allSettled([saveBotRecap(env,COMMUNITY,SETTINGS),saveBotRecap(env,COMMUNITY,settingsRow('events',ENDURANCES))]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.status,409);
  DB.db.prepare('UPDATE community_recap_settings SET lock_until=?').run(Date.now()+60000);
  assert.equal((await as(env,'/api/community/discord','PUT',INPUT)).status,409);
});

test('absence declarations and withdrawals edit only the existing event message',async t=>{
  const {DB,env,calls,messages}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);calls.length=0;
  DB.db.prepare('INSERT INTO event_absences(event_id,user_id,community_id,created_at) VALUES(?,?,?,0)').run('race-a',OWNER,DEV_COMMUNITY);
  await syncBotRecaps(env,NOW,COMMUNITY);assert.equal(sends(calls).length,0);assert.match(JSON.stringify([...messages.values()]),/Pilotes absents/);
  DB.db.prepare('DELETE FROM event_absences').run();await syncBotRecaps(env,NOW,COMMUNITY);
  assert.doesNotMatch(JSON.stringify([...messages.values()]),/Pilotes absents/);assert.equal(calls.filter(call=>call.method==='PATCH').length,2);
});

test('scheduled rotation prioritizes bot timestamps and ignores historical webhooks',async t=>{
  const {syncDueRecaps}=await import('../server/discord-weekly.mjs');
  const {DB,env,calls}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,GENERAL);
  DB.db.prepare('UPDATE community_recap_settings SET checked_at=?').run(NOW-2000);
  DB.db.prepare("INSERT INTO communities(id,slug,name,short_name,created_at) VALUES('legacy','legacy','Legacy','LEG',0)").run();
  DB.db.prepare("INSERT INTO community_recaps(community_id,scope,webhook_url,updated_at) VALUES('legacy','all','https://discord.com/api/webhooks/123456789012345678/token-aaaaaaaaaaaaaaaaaaaaaaaa',0)").run();
  DB.db.prepare("INSERT INTO discord_weekly_state(key,message_id,content_hash,week_key,updated_at,community_id) VALUES('legacy:all-weekly-v1','','','',?,'legacy')").run(NOW/1000-1);
  assert.equal(await syncDueRecaps(env,1,NOW),1);assert.equal(sends(calls).length,1,'the older bot recap is processed before the newer legacy recap');
  assert.ok(calls.every(call=>!call.path.includes('/webhooks/')));
});

test('a race gets its category 7 days before its start, even without any crew',async t=>{
  const {DB,env,calls}=setup(t);
  race(DB,'a-sunday','Dimanche','spa',[{id:'s',startsAt:NOW+DAY}]);race(DB,'b-week','Dans six jours','spa',[{id:'w',startsAt:NOW+6*DAY}]);race(DB,'c-far','Dans un mois','spa',[{id:'f',startsAt:NOW+30*DAY}]);
  assert.deepEqual((await previewBotRecap(env,NOW,COMMUNITY,SETTINGS)).map(item=>item.name),['🏎️ LMU · Dimanche','🏎️ LMU · Dans six jours']);
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  assert.deepEqual(creates(calls).map(call=>call.body.name),['🏎️ LMU · Dimanche','infos-de-la-course','🏎️ LMU · Dans six jours','infos-de-la-course']);
});

test('an official LMU race gets its category without any entry; an imported official iRacing race waits for one',async t=>{
  const {DB,env,calls}=setup(t);
  race(DB,'lmu','4h de Portimao','portimao',[{id:'p',startsAt:NOW+3*DAY}],'official');race(DB,'ir','Officielle iRacing','iracing-spa',[{id:'i',startsAt:NOW+DAY}],'official');
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  assert.deepEqual(creates(calls).map(call=>call.body.name),['🏎️ LMU · 4h de Portimao','infos-de-la-course']);
});

test('no new race category once the server is close to the 500 channels of Discord',async t=>{
  const {DB,env,calls,channels}=setup(t);
  for(let index=channels.length;index<450;index++)channels.push({id:String(700000000000000000n+BigInt(index)),type:2,name:'v'+index});
  race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  assert.equal(creates(calls).length,0);
});

test('official races where the community has nothing never hold back the recap of the race it has a crew in',async t=>{
  const {DB,env,calls,messages}=setup(t);
  for(const id of ['o1','o2','o3'])race(DB,id,'Officielle '+id,'iracing-spa',[{id:'s-'+id,startsAt:NOW+DAY}],'official');
  race(DB,'mine','10h officielle','spa',[{id:'m',startsAt:NOW+2*DAY}],'official');
  DB.db.prepare("INSERT INTO crews(id,event_id,departure_id,name,category,car,locked,created_at,community_id) VALUES('crew','mine','m','Les plots','GT3','',0,0,?)").run(DEV_COMMUNITY);
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  assert.deepEqual(creates(calls).map(call=>call.body.name),['🏎️ LMU · 10h officielle','infos-de-la-course'],'only the race with a crew');
  DB.db.prepare('UPDATE crews SET name=? WHERE id=?').run('Les plots 2','crew');
  calls.length=0;await syncBotRecaps(env,NOW+1000,COMMUNITY);await syncBotRecaps(env,NOW+2000,COMMUNITY);
  assert.equal(calls.filter(call=>call.method==='PATCH').length,1);
  assert.match(JSON.stringify([...messages.values()]),/Les plots 2/);
});


test('embed-only recaps require Embed Links in both destination modes',async t=>{
  const {env}=setup(t,{rights:'68624'});
  const destinations=await recapDestinations(env,COMMUNITY);
  for(const destination of destinations){assert.equal(destination.ready,false);assert.deepEqual(destination.missing,['Intégrer des liens']);}
  assert.equal((await as(env,'/api/community/discord','PUT',INPUT)).status,400);
  assert.equal((await as(env,'/api/community/discord','PUT',{mode:'general',lmuId:TEXT})).status,400);
});

test('new race categories preserve destination access rules; failed sends resume in the same channel',async t=>{
  const overrides=[{id:GUILD,type:0,deny:'1024',allow:'0'},{id:BOT,type:1,deny:'0',allow:'85008'}];
  const {DB,env,calls,channels,setFailure}=setup(t,{overrides});race(DB);
  await saveBotRecap(env,COMMUNITY,SETTINGS);
  const failure=(path,method)=>method==='POST'&&path.endsWith('/messages');setFailure(failure);
  await assert.rejects(syncBotRecaps(env,NOW,COMMUNITY),/permissions/);
  const row=DB.db.prepare('SELECT * FROM discord_recap_publications').get();
  assert.ok(row.channel_id);assert.equal(row.message_id,null);
  assert.deepEqual(channels.find(item=>item.id===row.category_id).permission_overwrites,overrides);
  setFailure(null);calls.length=0;await syncBotRecaps(env,NOW+1000,COMMUNITY);
  assert.equal(creates(calls).length,0);assert.equal(sends(calls).length,1);
  assert.equal(sends(calls)[0].path,`/channels/${row.channel_id}/messages`);
  assert.equal(DB.db.prepare('SELECT last_error FROM community_recap_settings').get().last_error,null);
});


test('scheduled bot rotation gives the next community its turn and disabling never falls back to a webhook',async t=>{
  const {syncDueRecaps}=await import('../server/discord-weekly.mjs');
  const {DB,env,calls}=setup(t);race(DB);
  DB.db.prepare("INSERT INTO communities(id,slug,name,short_name,discord_guild_id,created_at) VALUES('other','other','Other','OTH',?,0)").run(GUILD);
  await saveBotRecap(env,COMMUNITY,GENERAL);
  await saveBotRecap(env,{...COMMUNITY,id:'other'},GENERAL);
  DB.db.prepare("UPDATE community_recap_settings SET checked_at=? WHERE community_id='other'").run(NOW-1000);
  assert.equal(await syncDueRecaps(env,3,NOW),1);
  assert.ok(DB.db.prepare('SELECT message_id FROM discord_recap_publications WHERE community_id=?').get(DEV_COMMUNITY).message_id);
  assert.equal(await syncDueRecaps(env,3,NOW+1000),1);
  assert.ok(DB.db.prepare("SELECT message_id FROM discord_recap_publications WHERE community_id='other'").get().message_id);
  DB.db.prepare("INSERT INTO community_recaps(community_id,scope,webhook_url,updated_at) VALUES(?,'all','https://discord.com/api/webhooks/123456789012345678/token-aaaaaaaaaaaaaaaaaaaaaaaa',0)").run(DEV_COMMUNITY);
  await saveBotRecap(env,COMMUNITY,GENERAL,false);
  calls.length=0;await syncWeeklyDiscord(env,NOW+2000,COMMUNITY);assert.equal(sends(calls).length,0);assert.ok(calls.every(call=>!call.path.includes('/webhooks/')));
});


test('Discord diagnostics distinguish removed messages, missing channels and missing permissions',()=>{
  assert.match(recapError({status:404,code:10008}),/message de récap a été supprimé/);
  assert.match(recapError({status:404,path:'/channels/123/messages/456'}),/message de récap a été supprimé/);
  assert.match(recapError({status:404,code:10003,path:'/channels/123/messages?limit=100'}),/salon de publication/);
  assert.match(recapError({status:404,code:10004}),/serveur Discord/);
  assert.match(recapError({status:404}),/actualise les destinations/);
  assert.match(recapError({status:403,code:50013}),/permissions.*Intégrer des liens/);
});


test('repair rebuilds a deleted race category and channel while preserving the configured destination',async t=>{
  const {DB,env,calls,channels,messages}=setup(t);race(DB);
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  const old=DB.db.prepare('SELECT * FROM discord_recap_publications').get();
  channels.splice(channels.findIndex(item=>item.id===old.channel_id),1);
  channels.splice(channels.findIndex(item=>item.id===old.category_id),1);
  messages.clear();
  // Reproduce SPM's partial first publication (channel tracked, no message yet).
  DB.db.prepare("UPDATE discord_recap_publications SET message_id=NULL,content_hash=''").run();
  const failure=(path)=>path.startsWith(`/channels/${old.channel_id}/`);failure.status=404;
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>failure(String(url).replace('https://discord.com/api/v10',''))?Response.json({code:10003},{status:404}):original(url,options);
  await assert.rejects(syncBotRecaps(env,NOW+1,COMMUNITY),/salon de publication/);
  calls.length=0;
  globalThis.fetch=original;await repairBotRecap(env,NOW+2,COMMUNITY);
  const repaired=DB.db.prepare('SELECT * FROM discord_recap_publications').get();
  assert.notEqual(repaired.category_id,old.category_id);assert.notEqual(repaired.channel_id,old.channel_id);assert.ok(repaired.message_id);
  assert.equal(creates(calls).length,2);assert.equal(sends(calls).length,1);
  assert.ok(channels.some(item=>item.id===CATEGORY));
  calls.length=0;await repairBotRecap(env,NOW+3,COMMUNITY);
  assert.equal(creates(calls).length,0);assert.equal(sends(calls).length,0);
});


for(const mode of ['general','events'])test(`admin repair restores a removed ${mode} message without switching settings`,async t=>{
  const {DB,env,calls,messages}=setup(t);race(DB);
  const settings=mode==='general'?GENERAL:SETTINGS;
  await saveBotRecap(env,COMMUNITY,settings);await syncBotRecaps(env,NOW,COMMUNITY);
  const before=DB.db.prepare('SELECT * FROM discord_recap_publications').get();messages.clear();calls.length=0;
  await repairBotRecap(env,NOW,COMMUNITY);
  const after=DB.db.prepare('SELECT * FROM discord_recap_publications').get();
  assert.notEqual(after.message_id,before.message_id);assert.equal(after.channel_id,before.channel_id);assert.equal(creates(calls).length,0);assert.equal(sends(calls).length,1);
  assert.equal(DB.db.prepare('SELECT enabled FROM community_recap_settings').get().enabled,1);
  calls.length=0;await repairBotRecap(env,NOW,COMMUNITY);assert.equal(sends(calls).length,0);assert.equal(creates(calls).length,0);
});

test('repair refuses insufficient permissions or a missing destination; disabled recaps remain disabled',async t=>{
  const {DB,env,calls,channels,setFailure}=setup(t);race(DB);
  await saveBotRecap(env,COMMUNITY,SETTINGS,false);
  channels.find(c=>c.id===CATEGORY).permission_overwrites=[{id:BOT,type:1,deny:'16384',allow:'0'}];
  await assert.rejects(repairBotRecap(env,NOW,COMMUNITY),/Intégrer des liens/);assert.equal(creates(calls).length,0);
  channels.find(c=>c.id===CATEGORY).permission_overwrites=[];
  await repairBotRecap(env,NOW,COMMUNITY);assert.equal(DB.db.prepare('SELECT enabled FROM community_recap_settings').get().enabled,0);
  const fail=(path,method)=>method==='PATCH'&&path.includes('/messages/');fail.status=403;setFailure(fail);calls.length=0;
  await assert.rejects(repairBotRecap(env,NOW,COMMUNITY),/permissions/);assert.equal(sends(calls).length,0);
  setFailure(null);channels.splice(channels.findIndex(c=>c.id===CATEGORY),1);calls.length=0;
  await assert.rejects(repairBotRecap(env,NOW,COMMUNITY),/destination/);assert.equal(creates(calls).length,0);
});

test('repair endpoint is admin-only and uses saved settings instead of supplied destinations',async t=>{
  const {DB,env,calls}=setup(t);race(DB);
  await saveBotRecap(env,COMMUNITY,GENERAL);
  assert.equal((await as(env,'/api/community/recap/repair','POST',{},'222222222222222222')).status,403);
  assert.equal((await as(env,'/api/community/recap/repair','POST',{destinationId:'999999999999999999'})).status,200);
  assert.equal(creates(calls)[0].body.name,'récap-de-la-semaine','below the saved channel, not the supplied one');
});


test('repair of a removed category moves the surviving recap channel and keeps its message',async t=>{
  const {DB,env,calls,channels}=setup(t);race(DB);await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  const before=DB.db.prepare('SELECT * FROM discord_recap_publications').get();
  channels.splice(channels.findIndex(c=>c.id===before.category_id),1);channels.find(c=>c.id===before.channel_id).parent_id=null;
  calls.length=0;await repairBotRecap(env,NOW,COMMUNITY);
  const after=DB.db.prepare('SELECT * FROM discord_recap_publications').get();
  assert.notEqual(after.category_id,before.category_id);assert.equal(after.channel_id,before.channel_id);assert.equal(after.message_id,before.message_id);
  assert.equal(channels.find(c=>c.id===after.channel_id).parent_id,after.category_id);assert.equal(creates(calls).length,1);assert.equal(sends(calls).length,0);
});

test('a race opens 7 days before a start, a 24 h race 15 days before',()=>{
  const ev=(id,hours,days)=>({id,circuit:'spa',duration_hours:hours,departures:JSON.stringify([{id:'s',startsAt:NOW+days*DAY}])});
  const events=[ev('6h-8d',6,8),ev('6h-7d',6,7),ev('24h-16d',24,16),ev('24h-15d',24,15)];
  assert.deepEqual(racesOpenNow(events,'all',NOW),['6h-7d','24h-15d']);
});

test('a race channel is titled with the week of the race, not the current week',async t=>{
  const {DB,env}=setup(t);race(DB,'a','Spa','spa',[{id:'s',startsAt:NOW+5*DAY}]);
  const [preview]=await previewBotRecap(env,NOW,COMMUNITY,SETTINGS);
  assert.match(preview.payload.embeds[0].title,/semaine du 12 octobre au 18 octobre/i);
});

test('le bot envoie une fois les logos de catégorie manquants comme ses propres emojis', async t => {
  const original=globalThis.fetch,uploads=[];
  globalThis.fetch=async(url,options={})=>{
    const path=String(url).replace('https://discord.com/api/v10','');
    if(path===`/applications/${BOT}/emojis`&&(options.method||'GET')==='GET')return Response.json({items:[{id:'1',name:'em_gt3'}]});
    if(path===`/applications/${BOT}/emojis`){const body=JSON.parse(options.body);uploads.push(body);return Response.json({id:String(100+uploads.length),name:body.name});}
    return new Response('{}',{status:404});
  };
  t.after(()=>globalThis.fetch=original);
  const ASSETS={fetch:async request=>new Response(readFileSync(new URL('..'+new URL(request.url).pathname,import.meta.url)))};
  const ids=await botCategoryEmojis({DISCORD_CLIENT_ID:BOT,DISCORD_BOT_TOKEN:'fake',ASSETS},NOW);
  assert.equal(ids.em_gt3,'1');
  assert.ok(ids.em_hypercar&&ids.em_ir_gtp);
  assert.ok(uploads.every(item=>item.name!=='em_gt3'&&item.image.startsWith('data:image/png;base64,')));
  // Kept for a few hours: no new request.
  uploads.length=0;assert.deepEqual(await botCategoryEmojis({DISCORD_CLIENT_ID:BOT,DISCORD_BOT_TOKEN:'fake',ASSETS},NOW+60000),ids);assert.equal(uploads.length,0);
});

test('après un changement, la course modifiée est mise à jour en premier', async t => {
  const {DB,env,calls}=setup(t);
  for(const id of ['race-a','race-b','race-c'])race(DB,id,'Course '+id,'spa',[{id:'start-'+id,startsAt:NOW+DAY}]);
  await saveBotRecap(env,COMMUNITY,SETTINGS);
  for(let i=0;i<3;i++)await syncBotRecaps(env,NOW+i,COMMUNITY);
  assert.equal(DB.db.prepare('SELECT count(*) n FROM discord_recap_publications WHERE message_id IS NOT NULL').get().n,3);
  // Only two races per pass: the one just changed goes first, whatever its last check.
  DB.db.prepare("UPDATE discord_recap_publications SET checked_at=CASE event_id WHEN 'race-c' THEN 99 ELSE 1 END").run();
  calls.length=0;await syncBotRecaps(env,NOW+10,COMMUNITY,false,'race-c');
  assert.equal(DB.db.prepare("SELECT checked_at FROM discord_recap_publications WHERE event_id='race-c'").get().checked_at,NOW+10);
});

test('les catégories des courses se rangent par simu, LMU puis iRacing, chacune par date',async t=>{
  const {DB,env,channels}=setup(t);
  race(DB,'ir-soon','iRacing proche','iracing-spa',[{id:'a',startsAt:NOW+DAY}]);race(DB,'lmu-late','LMU tardive','spa',[{id:'b',startsAt:NOW+3*DAY}]);
  race(DB,'lmu-soon','LMU proche','monza',[{id:'c',startsAt:NOW+2*DAY}]);race(DB,'ir-late','iRacing tardive','iracing-monza',[{id:'d',startsAt:NOW+4*DAY}]);
  await saveBotRecap(env,COMMUNITY,SETTINGS);
  for(let pass=0;pass<2;pass++)await syncBotRecaps(env,NOW+pass,COMMUNITY);
  assert.deepEqual(channels.filter(item=>item.type===4).sort((a,b)=>a.position-b.position).map(item=>item.name),
    ['Accueil','Endurances','🏎️ LMU · LMU proche','🏎️ LMU · LMU tardive','🏁 iRacing · iRacing proche','🏁 iRacing · iRacing tardive','Vocaux']);
});


test('automatic recap sync regroups scattered existing race categories and then leaves the order stable',async t=>{
  const {DB,env,channels,calls}=setup(t);
  race(DB,'portimao','4h de Portimao','portimao',[{id:'a',startsAt:NOW+DAY}]);
  race(DB,'lemans','24H du Mans','le-mans',[{id:'b',startsAt:NOW+2*DAY}]);
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  const categories=channels.filter(item=>item.type===4);
  categories.find(item=>item.name.includes('du Mans')).position=-1;
  categories.find(item=>item.name.includes('Portimao')).position=20;
  // An unrelated category with a racing name is never adopted.
  channels.push({id:'777777777777777779',type:4,name:'🏎️ LMU · autre communauté',position:10});
  calls.length=0;await syncBotRecaps(env,NOW+1000,COMMUNITY);
  assert.deepEqual(channels.filter(item=>item.type===4).sort((a,b)=>a.position-b.position).map(item=>item.name),
    ['Accueil','Endurances','🏎️ LMU · 4h de Portimao','🏎️ LMU · 24H du Mans','Vocaux','🏎️ LMU · autre communauté']);
  assert.equal(creates(calls).length,0);assert.equal(sends(calls).length,0);
  assert.equal(calls.filter(call=>call.method==='PATCH'&&call.path===`/guilds/${GUILD}/channels`).length,1);
  calls.length=0;await syncBotRecaps(env,NOW+2000,COMMUNITY);
  assert.equal(calls.filter(call=>call.method==='PATCH').length,0,'already grouped categories do not generate writes');
});


test('recap setup validates voice access when crew channels are on and new race categories retain private pilot rules',async t=>{
  const overrides=[{id:GUILD,type:0,allow:'0',deny:'1049600'},{id:'777777777777777770',type:0,allow:'1049600',deny:'0'},{id:BOT,type:1,allow:'85008',deny:'0'}];
  const {env,DB,channels}=setup(t,{rights:'1133584',overrides});
  const community={...COMMUNITY,modules:{...COMMUNITY.modules,crewChannels:true}};
  const before=(await recapDestinations(env,community)).find(item=>item.id===CATEGORY);
  assert.equal(before.ready,false);assert.deepEqual(before.missing,['Se connecter']);
  overrides.find(item=>item.id===BOT).allow='1133584';
  assert.equal((await recapDestinations(env,community)).find(item=>item.id===CATEGORY).ready,true);
  race(DB);await saveBotRecap(env,community,SETTINGS);await syncBotRecaps(env,NOW,community);
  const createdCategory=channels.find(item=>item.type===4&&item.name.startsWith('🏎️'));
  assert.deepEqual(createdCategory.permission_overwrites.slice(0,2),overrides.slice(0,2));
  assert.equal(createdCategory.permission_overwrites.find(item=>item.id===BOT).allow,'1133584');
});

function solo(DB,id,name,startsAt,capacity=null,community=DEV_COMMUNITY){
  DB.db.prepare(`INSERT INTO events(id,name,circuit,duration_hours,categories,departures,created_by,created_at,community_id,format,capacity) VALUES(?,?,'monza',1,'["GT3"]',?,?,0,?,'solo',?)`)
    .run(id,name,JSON.stringify([{id:'d-'+id,startsAt}]),OWNER,community,capacity);
}

test('the week calendar is its own message, never mixed with the endurances',async t=>{
  const {DB,env,calls,messages,channels}=setup(t);race(DB);solo(DB,'sprint','Sprint du mardi',NOW+DAY,2);solo(DB,'cup','Coupe du jeudi',NOW+DAY/4);
  const participant=DB.db.prepare("INSERT INTO participants(id,name,user_id,created_by,created_at,community_id) VALUES(?,?,?,?,0,?)");
  participant.run('p1','Admin',OWNER,OWNER,DEV_COMMUNITY);DB.db.prepare("INSERT INTO users(id,name,created_at) VALUES('222222222222222229','Pilote 2',0)").run();participant.run('p2','Pilote 2','222222222222222229',OWNER,DEV_COMMUNITY);
  const insert=DB.db.prepare("INSERT INTO registrations(id,event_id,departure_id,user_id,name,name_key,category,status,created_at,participant_id,community_id) VALUES(?,?,?,?,?,?,'GT3','whole',0,?,?)");
  insert.run('r1','sprint','d-sprint',OWNER,'Admin','admin','p1',DEV_COMMUNITY);insert.run('r2','sprint','d-sprint','222222222222222229','Pilote 2','pilote 2','p2',DEV_COMMUNITY);
  const community={...COMMUNITY,modules:{...COMMUNITY.modules,soloRaces:true}};
  await saveBotRecap(env,community,settingsRow('events',ENDURANCES,ENDURANCES,RECAP));await syncBotRecaps(env,NOW,community);
  const made=channels.find(item=>item.name==='calendrier-de-la-semaine');assert.ok(made,'the bot makes its channel below the chosen one');
  const calendar=sends(calls).find(call=>call.path===`/channels/${made.id}/messages`);assert.ok(calendar);
  const text=JSON.stringify(calendar.body);
  assert.match(text,/📅 Calendrier de la semaine/);assert.match(text,/Sprint du mardi/);assert.match(text,/Coupe du jeudi/);
  assert.match(text,/2\/2 places · complet/);assert.doesNotMatch(text,/6h de Spa/,'the endurances stay in their category');
  assert.doesNotMatch(JSON.stringify(sends(calls).filter(call=>call!==calendar).map(call=>call.body)),/Sprint du mardi/,'events never get a race category');
  assert.ok(!creates(calls).some(call=>/Sprint/.test(call.body.name)));
  // Events module off: the calendar message goes.
  calls.length=0;await syncBotRecaps(env,NOW+1000,COMMUNITY);
  assert.equal(calls.filter(call=>call.method==='DELETE'&&call.path.startsWith(`/channels/${made.id}/messages/`)).length,1);
  assert.ok(calls.some(call=>call.method==='DELETE'&&call.path===`/channels/${made.id}`),'with the bot’s channel');
  assert.ok(channels.some(item=>item.id===TEXT),'never the admins’ channel');
  assert.ok(![...messages.values()].some(item=>/Calendrier/.test(JSON.stringify(item))));
});

test('LMU and iRacing races go under their own chosen category; the order of the week messages follows the community',async t=>{
  const {DB,env,calls,channels}=setup(t);race(DB);race(DB,'ir','Course iRacing','iracing-spa');
  const VOICES='111111111111111112';
  await saveBotRecap(env,COMMUNITY,settingsRow('events',ENDURANCES,{id:VOICES,name:'Vocaux'}));await syncBotRecaps(env,NOW,COMMUNITY);
  const parent=name=>channels.find(item=>item.type===4&&item.name===name);
  const sorted=channels.filter(item=>item.type===4).sort((a,b)=>a.position-b.position).map(item=>item.name);
  assert.deepEqual(sorted,['Accueil','Endurances','🏎️ LMU · 6h de Spa','Vocaux','🏁 iRacing · Course iRacing']);
  assert.ok(parent('🏎️ LMU · 6h de Spa')&&parent('🏁 iRacing · Course iRacing'));
  // Only LMU published from now on: the iRacing race keeps its channels until they expire, no new one appears.
  race(DB,'ir2','Autre iRacing','iracing-monza');
  await saveBotRecap(env,COMMUNITY,SETTINGS_LMU());calls.length=0;await syncBotRecaps(env,NOW+1000,COMMUNITY);
  assert.ok(!creates(calls).some(call=>/Autre iRacing/.test(call.body.name)));
  // Week messages: endurances first, the calendar first at TDZ.
  const tdz={...COMMUNITY,slug:'tdz',modules:{...COMMUNITY.modules,soloRaces:true}},other={...COMMUNITY,modules:{...COMMUNITY.modules,soloRaces:true}};
  solo(DB,'s','Sprint',NOW+DAY);const both=settingsRow('general',RECAP,RECAP,RECAP);
  assert.deepEqual((await previewBotRecap(env,NOW,other,both)).map(item=>item.name),['recap · Endurances LMU','recap · Endurances iRacing','recap · Calendrier de la semaine']);
  assert.deepEqual((await previewBotRecap(env,NOW,tdz,both)).map(item=>item.name),['recap · Calendrier de la semaine','recap · Endurances LMU','recap · Endurances iRacing']);
});
const SETTINGS_LMU=()=>settingsRow('events',ENDURANCES);

test('the Discord setting saves the recap, the crew voices and the reminders together',async t=>{
  const {DB,env}=setup(t,{rights:'1133584'});
  const saved=await as(env,'/api/community/discord','PUT',{mode:'general',lmuId:TEXT,crewChannels:true,crewCategory:'111111111111111112',raceReminders:true});
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  const modules=JSON.parse(DB.db.prepare('SELECT modules FROM communities WHERE id=?').get(DEV_COMMUNITY).modules);
  assert.equal(modules.crewChannels,true);assert.equal(modules.raceReminders,true);
  assert.equal(DB.db.prepare('SELECT voice_category_id FROM community_crew_discord WHERE community_id=?').get(DEV_COMMUNITY)?.voice_category_id,'111111111111111112');
  const page=(await as(env,'/api/community/setup')).data.botRecap;
  assert.deepEqual([page.enabled,page.mode,page.lmuId,page.iracingId],[true,'general',TEXT,'']);
  assert.equal((await as(env,'/api/community/discord','PUT',{mode:'general'})).status,400,'at least one place');
  assert.equal((await as(env,'/api/community/discord','PUT',{enabled:false})).status,200);
  const off=JSON.parse(DB.db.prepare('SELECT modules FROM communities WHERE id=?').get(DEV_COMMUNITY).modules);
  assert.equal(off.crewChannels,false);assert.equal(off.raceReminders,false);
  assert.equal(DB.db.prepare('SELECT enabled FROM community_recap_settings').get().enabled,0);
});

test('migration 0079 keeps the existing recap of each community',()=>{
  const db=new DatabaseSync(':memory:');
  const files=readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort();
  for(const file of files.filter(file=>file<'0079'))db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  db.exec("INSERT INTO communities(id,slug,name,short_name,created_at) VALUES('a','aa','A','A',0),('b','bb','B','B',0),('c','cc','C','C',0)");
  const insert=db.prepare("INSERT INTO community_recap_settings(community_id,enabled,mode,scope,guild_id,destination_id,destination_name) VALUES(?,1,?,?,'1',?,?)");
  insert.run('a','events','all','10','Endurances');insert.run('b','general','iracing','20','recap');insert.run('c','general','lmu','30','recap');
  const publication=db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,marker) VALUES(?,?,'1',?)");
  publication.run('b','','mb');publication.run('c','','mc');publication.run('a','race','ma');
  db.exec(readFileSync(new URL('../migrations/'+files.find(file=>file.startsWith('0079')),import.meta.url),'utf8'));
  const row=id=>({...db.prepare('SELECT destination_id,iracing_destination_id FROM community_recap_settings WHERE community_id=?').get(id)});
  assert.deepEqual(row('a'),{destination_id:'10',iracing_destination_id:'10'});
  assert.deepEqual(row('b'),{destination_id:'',iracing_destination_id:'20'});
  assert.deepEqual(row('c'),{destination_id:'30',iracing_destination_id:''});
  assert.deepEqual(db.prepare('SELECT community_id,event_id FROM discord_recap_publications ORDER BY community_id').all().map(item=>[item.community_id,item.event_id]),[['a','race'],['b','week:iracing'],['c','week:lmu']]);
});

test('in a category, the bot makes its own week channels with its rights: endurances share one, the calendar has its own',async t=>{
  const {DB,env,calls,channels,messages}=setup(t);race(DB);race(DB,'ir','Course iRacing','iracing-spa');solo(DB,'s','Sprint',NOW+DAY/4);
  const community={...COMMUNITY,modules:{...COMMUNITY.modules,soloRaces:true}};
  await saveBotRecap(env,community,settingsRow('general',ENDURANCES,ENDURANCES,ENDURANCES));await syncBotRecaps(env,NOW,community);
  const made=creates(calls).map(call=>call.body);
  assert.deepEqual(made.map(body=>[body.type,body.name,body.parent_id]),[[0,'récap-de-la-semaine',CATEGORY],[0,'calendrier-de-la-semaine',CATEGORY]]);
  assert.ok(made.every(body=>body.permission_overwrites.some(item=>item.id===BOT&&item.type===1)),'the bot gives itself its rights');
  const recap=channels.find(item=>item.name==='récap-de-la-semaine').id,calendar=channels.find(item=>item.name==='calendrier-de-la-semaine').id;
  assert.deepEqual(sends(calls).map(call=>call.path),[`/channels/${recap}/messages`,`/channels/${recap}/messages`,`/channels/${calendar}/messages`]);
  calls.length=0;await syncBotRecaps(env,NOW+1000,community);assert.equal(creates(calls).length,0);assert.equal(sends(calls).length,0);
  // Moved to another category: new channels there, the old ones go once no recap uses them.
  const VOICES='111111111111111112';
  await saveBotRecap(env,community,settingsRow('general',{id:VOICES,name:'Vocaux'},{id:VOICES,name:'Vocaux'},{id:VOICES,name:'Vocaux'}));
  calls.length=0;await syncBotRecaps(env,NOW+2000,community);await syncBotRecaps(env,NOW+3000,community);
  assert.deepEqual(calls.filter(call=>call.method==='DELETE'&&/^\/channels\/\d+$/.test(call.path)).map(call=>call.path).sort(),[`/channels/${recap}`,`/channels/${calendar}`].sort());
  assert.deepEqual(creates(calls).map(call=>call.body.parent_id),[VOICES,VOICES]);
  assert.equal(messages.size,3);
});

test('switching to « récap de la semaine » removes the race categories at once; switching back makes them again',async t=>{
  const {DB,env,calls,channels}=setup(t);race(DB);
  await saveBotRecap(env,COMMUNITY,SETTINGS);await syncBotRecaps(env,NOW,COMMUNITY);
  assert.ok(channels.some(item=>item.name==='🏎️ LMU · 6h de Spa'));
  await saveBotRecap(env,COMMUNITY,settingsRow('general',ENDURANCES));calls.length=0;await syncBotRecaps(env,NOW+1000,COMMUNITY);
  assert.ok(!channels.some(item=>item.name==='🏎️ LMU · 6h de Spa'||item.name==='infos-de-la-course'));
  assert.ok(channels.some(item=>item.id===CATEGORY),'the chosen category stays');
  await saveBotRecap(env,COMMUNITY,SETTINGS);calls.length=0;await syncBotRecaps(env,NOW+2000,COMMUNITY);
  assert.ok(channels.some(item=>item.name==='🏎️ LMU · 6h de Spa'));
});
