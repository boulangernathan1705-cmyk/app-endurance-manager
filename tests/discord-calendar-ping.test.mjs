import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {calendarPingDue,syncCalendarPings} from '../server/discord-calendar-ping.mjs';
import {layoutInput,calendarPingInput} from '../server/discord-layout.mjs';
import {linkTestServer,setMember,DEV_COMMUNITY,GUILD,ORGA_ROLE} from './fixtures/discord-server.mjs';

const CALENDAR='555555555555555555', BOT='444444444444444444', MINUTE=60000;
// Monday 30 November 2026, 8h00 in Paris (winter time: UTC+1).
const MONDAY_8=Date.parse('2026-11-30T07:00:00Z');
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())this.db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));linkTestServer(this.db);}
  prepare(sql){const db=this.db;return {params:[],bind(...params){this.params=params;return this;},async first(){return db.prepare(sql).get(...this.params)||null;},async all(){return {results:db.prepare(sql).all(...this.params)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.params).changes)}};}};}
  async batch(statements){return Promise.all(statements.map(statement=>statement.run()));}
}
function setup(t,{ping={day:1,time:'08:00',from:0},everyone=true}={}){
  const DB=new D1(),calls=[];let counter=900000000000000000n;
  DB.db.prepare(`INSERT INTO community_recap_settings(community_id,enabled,mode,scope,guild_id,destination_id,destination_name,layout) VALUES(?,1,'events','all',?,'','',?)`)
    .run(DEV_COMMUNITY,GUILD,JSON.stringify({v:1,mode:'events',sims:'all',showEvents:true,calendarPing:ping}));
  DB.db.prepare(`INSERT INTO discord_recap_publications(community_id,event_id,guild_id,channel_id,message_id,marker) VALUES(?,'week:calendar',?,?,'800000000000000001','m')`).run(DEV_COMMUNITY,GUILD,CALENDAR);
  const env={DB,APP_ORIGIN:'https://site.example',DISCORD_BOT_TOKEN:'fake',DISCORD_CLIENT_ID:BOT};
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const path=String(url).replace('https://discord.com/api/v10',''),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    calls.push({path,method,body});
    if(path===`/channels/${CALENDAR}`)return Response.json({id:CALENDAR,name:'calendrier',permission_overwrites:everyone?[]:[{id:BOT,type:1,allow:'0',deny:'131072'}]});
    if(path===`/guilds/${GUILD}/roles`)return Response.json([{id:GUILD,permissions:String(1024|2048|131072)}]);
    if(path===`/guilds/${GUILD}/members/${BOT}`)return Response.json({user:{id:BOT},roles:[]});
    if(path===`/channels/${CALENDAR}/messages`&&method==='POST')return Response.json({id:String(counter++),...body});
    if(method==='DELETE')return new Response(null,{status:204});
    return new Response('{}',{status:404});
  };
  t.after(()=>globalThis.fetch=original);
  const settings=()=>DB.db.prepare('SELECT * FROM community_recap_settings WHERE community_id=?').get(DEV_COMMUNITY);
  return {DB,env,calls,settings};
}

test('the answer: a day and an hour, or nothing', () => {
  assert.equal(calendarPingInput('', '08:00'), null);
  assert.deepEqual(calendarPingInput('1', '07:45'), {day:1, time:'07:45'});
  assert.throws(() => calendarPingInput('7', '25:00'), /heure/);
  assert.deepEqual(layoutInput({mode:'events', sims:'all', under:'top', calendarPingDay:'7', calendarPingTime:'20:00'}).calendarPing, {day:7, time:'20:00'});
  assert.equal(layoutInput({mode:'events', sims:'all', under:'top'}).calendarPing, undefined);
});

test('due on the chosen day, from the chosen hour, for two hours, once', () => {
  const ping = {day:1, time:'08:00'};
  assert.equal(calendarPingDue(ping, MONDAY_8 - MINUTE), '');
  assert.equal(calendarPingDue(ping, MONDAY_8), '2026-11-30');
  assert.equal(calendarPingDue(ping, MONDAY_8 + 119 * MINUTE), '2026-11-30');
  assert.equal(calendarPingDue(ping, MONDAY_8 + 120 * MINUTE), '');
  assert.equal(calendarPingDue(ping, MONDAY_8, '2026-11-30'), '');
  // Another day of the week: nothing.
  assert.equal(calendarPingDue(ping, MONDAY_8 + 1440 * MINUTE), '');
  assert.equal(calendarPingDue({day:2, time:'08:00'}, MONDAY_8 + 1440 * MINUTE), '2026-12-01');
  // Turned on after this week's time: the first ping next week.
  assert.equal(calendarPingDue({...ping, from:MONDAY_8 + 10 * MINUTE}, MONDAY_8 + 30 * MINUTE), '');
  // Summer time (UTC+2): Monday 6 July 2026, 8h00 in Paris.
  assert.equal(calendarPingDue(ping, Date.parse('2026-07-06T06:00:00Z')), '2026-07-06');
});

test('one @everyone under the calendar, last week’s deleted', async t => {
  const {env, calls, settings, DB} = setup(t);
  assert.equal(await syncCalendarPings(env, MONDAY_8 - MINUTE), false);
  assert.equal(await syncCalendarPings(env, MONDAY_8), true);
  const sent = calls.find(call => call.method === 'POST');
  assert.equal(sent.path, `/channels/${CALENDAR}/messages`);
  assert.match(sent.body.content, /^@everyone 📅 Le calendrier de la semaine est à jour : https:\/\/discord\.com\/channels\/\d+\/555555555555555555\/800000000000000001$/);
  assert.deepEqual(sent.body.allowed_mentions, {parse:['everyone']});
  const first = settings().calendar_ping_message;
  assert.ok(first);
  // The next passes the same day: nothing more.
  calls.length = 0;
  assert.equal(await syncCalendarPings(env, MONDAY_8 + 2 * MINUTE), false);
  assert.equal(calls.length, 0);
  // A week later: the old ping deleted, a new one sent.
  assert.equal(await syncCalendarPings(env, MONDAY_8 + 7 * 1440 * MINUTE), true);
  assert.ok(calls.some(call => call.method === 'DELETE' && call.path === `/channels/${CALENDAR}/messages/${first}`));
  assert.notEqual(settings().calendar_ping_message, first);
  // Turned off: nothing.
  DB.db.prepare('UPDATE community_recap_settings SET enabled=0').run();
  assert.equal(await syncCalendarPings(env, MONDAY_8 + 14 * 1440 * MINUTE), false);
});

test('without « Mentionner @everyone »: no message, the admins are told', async t => {
  const {env, calls, DB} = setup(t, {everyone:false});
  DB.db.prepare("INSERT INTO users(id,name,created_at) VALUES('111111111111111111','Admin',0)").run();
  setMember(DB.db, '111111111111111111', [ORGA_ROLE]);
  assert.equal(await syncCalendarPings(env, MONDAY_8), true);
  assert.ok(!calls.some(call => call.method === 'POST'));
  const bell = DB.db.prepare("SELECT * FROM notifications WHERE kind='discord_error'").all();
  assert.equal(bell.length, 1);
  assert.match(JSON.stringify(bell[0]), /Mentionner @everyone/);
  // Not tried again this week.
  calls.length = 0;
  assert.equal(await syncCalendarPings(env, MONDAY_8 + 2 * MINUTE), false);
  assert.equal(calls.length, 0);
});
