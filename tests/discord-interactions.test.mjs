import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {discordAbsentButton} from '../server/discord-interactions.mjs';
import {linkTestServer,DEV_COMMUNITY,GUILD} from './fixtures/discord-server.mjs';

const PILOT='777777777777777777', EVENT='00000000-0000-4000-8000-0000000000a1', THREAD='888888888888888888';
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())this.db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));linkTestServer(this.db);}
  prepare(sql){const db=this.db;return {params:[],bind(...params){this.params=params;return this;},async first(){return db.prepare(sql).get(...this.params)||null;},async all(){return {results:db.prepare(sql).all(...this.params)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.params).changes)}};}};}
}
const hex=bytes=>Buffer.from(bytes).toString('hex');
async function setup(){
  const keys=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  const DB=new D1();
  DB.db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run('111111111111111111','Orga');
  DB.db.prepare(`INSERT INTO events(id,name,circuit,duration_hours,categories,departures,created_by,created_at,community_id) VALUES(?,'6h de Spa','spa',6,'["GT3"]',?,'111111111111111111',0,?)`)
    .run(EVENT,JSON.stringify([{id:'start-a',startsAt:Date.now()+86400000}]),DEV_COMMUNITY);
  DB.db.prepare(`INSERT INTO discord_recap_publications(community_id,event_id,guild_id,channel_id,marker,in_thread) VALUES(?,?,?,?,'m',1)`).run(DEV_COMMUNITY,EVENT,GUILD,THREAD);
  const env={DB,APP_ORIGIN:'https://site.example',DISCORD_PUBLIC_KEY:hex(await crypto.subtle.exportKey('raw',keys.publicKey))};
  const click=async(body,{sign=true}={})=>{
    const text=JSON.stringify(body),timestamp=String(Math.floor(Date.now()/1000));
    const signature=sign?hex(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(timestamp+text))):'0'.repeat(128);
    const response=await worker.fetch(new Request('https://site.example/discord/interactions',{method:'POST',body:text,headers:{'X-Signature-Ed25519':signature,'X-Signature-Timestamp':timestamp}}),env);
    return {status:response.status,body:response.status===200?await response.json():null};
  };
  const button=(id,roles=[])=>({type:3,guild_id:GUILD,channel_id:THREAD,data:{custom_id:id},member:{roles,permissions:'0',user:{id:PILOT,username:'bob',global_name:'Bob'}}});
  return {DB,env,click,button};
}

test('the « Absent » button of a race\'s thread marks the pilot absent on the site; « Annuler » takes it back',async()=>{
  const {DB,click,button}=await setup();
  // Discord checks the address with a signed PING; an unsigned request is refused.
  assert.deepEqual((await click({type:1})).body,{type:1});
  assert.equal((await click(button(`absent:${EVENT}`),{sign:false})).status,401);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS n FROM event_absences').get().n,0);

  const absent=await click(button(`absent:${EVENT}`));
  assert.equal(absent.body.type,4);assert.equal(absent.body.data.flags,64,'only the pilot sees the answer');
  assert.match(absent.body.data.content,/tu es absent pour \*\*6h de Spa\*\*/);
  assert.deepEqual(DB.db.prepare('SELECT event_id,user_id,community_id FROM event_absences').all().map(row=>({...row})),[{event_id:EVENT,user_id:PILOT,community_id:DEV_COMMUNITY}]);
  assert.equal(DB.db.prepare('SELECT name FROM users WHERE id=?').get(PILOT).name,'Bob','a pilot who never came gets his account');
  assert.equal(absent.body.data.components[0].components[0].custom_id,`undo:${EVENT}`);

  const undo=await click(button(`undo:${EVENT}`));
  assert.equal(undo.body.type,7);assert.match(undo.body.data.content,/plus marqué absent/);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS n FROM event_absences').get().n,0);
});

test('« Absent » from Discord follows the site\'s rules: entered pilots, no access, past or unknown races',async()=>{
  const {DB,click,button}=await setup();
  // Without the endurance right on this server (@everyone without it).
  DB.db.prepare('UPDATE community_role_permissions SET permissions=? WHERE discord_role_id=?').run('["access"]',GUILD);
  assert.match((await click(button(`absent:${EVENT}`))).body.data.content,/pas l’accès aux endurances/);
  DB.db.prepare('UPDATE community_role_permissions SET permissions=? WHERE discord_role_id=?').run('["access","endurance"]',GUILD);
  // Entered: the entry is withdrawn on the site first.
  DB.db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run(PILOT,'Bob');
  DB.db.prepare(`INSERT INTO participants(id,name,user_id,created_by,created_at,community_id) VALUES('p1','Bob',?,?,0,?)`).run(PILOT,PILOT,DEV_COMMUNITY);
  DB.db.prepare(`INSERT INTO registrations(id,event_id,departure_id,user_id,owner_user_id,name,name_key,category,status,created_at,participant_id,community_id) VALUES('r1',?,'start-a',?,?,'Bob','bob','GT3','whole',0,'p1',?)`).run(EVENT,PILOT,PILOT,DEV_COMMUNITY);
  const entered=await click(button(`absent:${EVENT}`));
  assert.match(entered.body.data.content,/Tu es inscrit/);assert.match(entered.body.data.components[0].components[0].url,new RegExp(`#event=${EVENT}$`));
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS n FROM event_absences').get().n,0);
  // Another server's click, or a race gone: nothing changes.
  assert.match((await click({...button(`absent:${EVENT}`),guild_id:'123456789012345678'})).body.data.content,/plus sur le site/);
  DB.db.prepare('UPDATE events SET departures=? WHERE id=?').run(JSON.stringify([{id:'start-a',startsAt:Date.now()-3600000}]),EVENT);
  assert.match((await click(button(`absent:${EVENT}`))).body.data.content,/passée/);
});

test('the threads get « Absent » only once Discord sends the clicks to the site (its key is set)',()=>{
  assert.equal(discordAbsentButton({}),null);
  assert.deepEqual(discordAbsentButton({DISCORD_PUBLIC_KEY:'a'.repeat(64)})(EVENT),{type:2,style:4,label:'Absent',emoji:{name:'❌'},custom_id:`absent:${EVENT}`});
});
