import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {hash} from '../server/core.mjs';
import {eventListTag} from '../server/event-revision.mjs';
import {linkTestServer,setMember,DEV_COMMUNITY,GUILD} from './fixtures/discord-server.mjs';

const ROOT='https://site.example', USER='222222222222222222', OTHER='333333333333333333';
class D1 {
  constructor({revision=true}={}) {
    this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');this.reads=[];
    for (const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()) {
      if (!revision && name.startsWith('0090_')) break;
      this.db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
    }
  }
  prepare(sql) {
    const self=this;
    return {params:[],bind(...params){this.params=params;return this;},
      async first(){self.reads.push(sql);return self.db.prepare(sql).get(...this.params)||null;},
      async all(){self.reads.push(sql);return {results:self.db.prepare(sql).all(...this.params)};},
      async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};
  }
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}
async function setup(options) {
  const DB=new D1(options);linkTestServer(DB.db);
  const cookies={};
  for (const [i,id] of [USER,OTHER].entries()) {
    DB.db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run(id,'Pilot '+i);
    setMember(DB.db,id);
    const raw=String(i+1).repeat(64);cookies[id]=`__Host-em_session=${raw}`;
    DB.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(await hash(raw),id,Math.floor(Date.now()/1000)+86400*30);
  }
  const env={DB,APP_ORIGIN:ROOT,COMMUNITY:'commu-dev',ASSETS:{fetch:async()=>new Response('static')}};
  const raceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', departureId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  function race(id=raceId,startsAt=Date.now()+86400000*3,sim='lmu',departures=null) {
    DB.db.prepare(`INSERT INTO events(id,name,categories,departures,created_by,created_at,community_id,circuit,sim)
      VALUES(?,'Race','["Hypercar"]',?,?,0,?,'spa',?)`).run(id,JSON.stringify(departures||[{id:departureId,startsAt}]),USER,DEV_COMMUNITY,sim);
  }
  race();
  const req=(tag=null,{user=USER,path='/api/races?game=lmu&scope=upcoming',cookie=cookies[user]}={})=>worker.fetch(new Request(ROOT+path,{headers:{Cookie:cookie||'',...(tag?{'If-None-Match':tag}:{})}}),env);
  const tagOf=async()=>{const response=await req();assert.equal(response.status,200);return response.headers.get('ETag');};
  return {DB,env,req,tagOf,race,raceId,departureId,cookies};
}

test('unchanged refresh skips the event graph; mutations made directly in D1 invalidate it',async()=>{
  const {DB,req,tagOf,raceId}=await setup();
  let tag=await tagOf();assert.match(tag,/^W\/"[a-f0-9]{64}"$/);
  DB.reads=[];
  const unchanged=await req(tag);
  assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
  assert.equal(unchanged.headers.get('Cache-Control'),'no-store');
  assert.equal(DB.reads.some(sql=>/SELECT e\.\*/.test(sql)),false,'no event assembly on a hit');
  assert.ok(DB.reads.some(sql=>sql.includes('FROM sessions')),'identity is checked again');
  assert.ok(DB.reads.some(sql=>sql.includes('FROM memberships')),'access is checked again');
  DB.db.prepare('UPDATE events SET name=? WHERE id=?').run('Renamed race',raceId);
  const changed=await req(tag);assert.equal(changed.status,200);assert.equal((await changed.json()).events[0].name,'Renamed race');
  assert.notEqual(changed.headers.get('ETag'),tag);tag=changed.headers.get('ETag');
  DB.db.prepare('DELETE FROM events WHERE id=?').run(raceId);
  const removed=await req(tag);assert.equal(removed.status,200);assert.deepEqual((await removed.json()).events,[]);
});

test('registrations, crews, absences, names and role changes invalidate the representation',async()=>{
  const {DB,req,tagOf,raceId,departureId}=await setup();
  const participant='cccccccc-cccc-4ccc-8ccc-cccccccccccc',registration='dddddddd-dddd-4ddd-8ddd-dddddddddddd',crew='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const changed=async(sql,...params)=>{const tag=await tagOf();DB.db.prepare(sql).run(...params);const response=await req(tag);assert.equal(response.status,200,sql);assert.notEqual(response.headers.get('ETag'),tag,sql);return response.json();};
  await changed('INSERT INTO participants(id,name,user_id,created_at,community_id) VALUES(?,?,?,0,?)',participant,'Pilot',USER,DEV_COMMUNITY);
  await changed(`INSERT INTO registrations(id,event_id,departure_id,name,name_key,category,status,created_at,user_id,participant_id,community_id)
    VALUES(?,?,?,'Pilot','pilot','Hypercar','whole',0,?,?,?)`,registration,raceId,departureId,USER,participant,DEV_COMMUNITY);
  await changed(`INSERT INTO crews(id,event_id,departure_id,name,category,created_at,community_id) VALUES(?,?,?,'Team','Hypercar',0,?)`,crew,raceId,departureId,DEV_COMMUNITY);
  await changed('INSERT INTO crew_members(crew_id,registration_id) VALUES(?,?)',crew,registration);
  await changed('UPDATE crews SET name=? WHERE id=?','Renamed team',crew);
  await changed('INSERT INTO event_absences(event_id,user_id,community_id,created_at) VALUES(?,?,?,0)',raceId,OTHER,DEV_COMMUNITY);
  await changed('UPDATE memberships SET nickname=? WHERE user_id=?','New nickname',USER);
  await changed('UPDATE users SET name=? WHERE id=?','New global name',OTHER);
  await changed('UPDATE community_role_permissions SET permissions=? WHERE discord_role_id=?',JSON.stringify(['access','endurance','solo_open','crews']),GUILD);
  const tag=await tagOf();
  DB.db.prepare('UPDATE memberships SET checked_at=checked_at+1 WHERE user_id=?').run(USER);
  assert.equal((await req(tag)).status,304,'a routine membership check does not invalidate the list');
});

test('conditional responses never bypass permissions, session expiry or representation scope',async()=>{
  const {DB,env,req,tagOf}=await setup();const tag=await tagOf();
  assert.equal((await req(tag,{user:OTHER})).status,200,'private data is bound to the reader');
  assert.equal((await req(tag,{path:'/api/races?game=iracing&scope=upcoming'})).status,200);
  assert.equal((await req(tag,{path:'/api/races?game=lmu&scope=archived'})).status,200);
  assert.equal((await req('*')).status,200,'a wildcard is not proof of a cached representation');
  env.SITE_ENV='development';assert.equal((await req(tag)).status,200);delete env.SITE_ENV;
  DB.db.prepare("UPDATE memberships SET status='left' WHERE user_id=?").run(USER);
  assert.equal((await req(tag)).status,403,'revocation is enforced before conditional handling');
  setMember(DB.db,USER);
  DB.db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run(USER);
  assert.equal((await req(tag)).status,401,'expired sessions cannot use cached data');
});

test('archive boundaries and the upcoming one-day margin invalidate without database writes',async t=>{
  const {DB,req,raceId}=await setup();const clock=Date.now,at=clock(),start=at+10000;
  DB.db.prepare('UPDATE events SET departures=? WHERE id=?').run(JSON.stringify([{id:'dep',startsAt:start}]),raceId);
  t.after(()=>{Date.now=clock;});
  Date.now=()=>start-1;
  const archivePath='/api/races?game=lmu&scope=archived';
  const before=await req(null,{path:archivePath});const tag=before.headers.get('ETag');assert.equal((await before.json()).events.length,0);
  Date.now=()=>start;
  const after=await req(tag,{path:archivePath});assert.equal(after.status,200);assert.equal((await after.json()).events.length,1);
  Date.now=()=>start+86400000-1;
  const margin=await req();const marginTag=margin.headers.get('ETag');assert.equal((await margin.json()).events.length,1);
  Date.now=()=>start+86400000;
  const expired=await req(marginTag);assert.equal(expired.status,200);assert.equal((await expired.json()).events.length,0);
});

test('stream crew expiry uses the first departure, including multi-start historical data',async()=>{
  const {env,DB,race}=await setup();const start=Date.now();
  race('ffffffff-ffff-4fff-8fff-ffffffffffff',start,'stream',[{startsAt:start},{startsAt:start+86400000*2}]);
  const actor={user:{id:USER},permissions:new Set(['access']),manager:false};
  const options={game:'',scope:'archived',origin:ROOT};
  const before=await eventListTag(env,actor,{id:DEV_COMMUNITY},{...options,at:start+86400000});
  const revision=DB.db.prepare('SELECT revision FROM event_list_revision').get().revision;
  const after=await eventListTag(env,actor,{id:DEV_COMMUNITY},{...options,at:start+86400000+1});
  assert.notEqual(after,before);assert.equal(DB.db.prepare('SELECT revision FROM event_list_revision').get().revision,revision);
  const plan=DB.db.prepare("EXPLAIN QUERY PLAN SELECT MAX(CAST(json_extract(departures,'$[0].startsAt') AS INTEGER)) FROM events WHERE sim='stream' AND CAST(json_extract(departures,'$[0].startsAt') AS INTEGER)<?").all(start);
  assert.match(plan.map(row=>row.detail).join(' '),/USING INDEX events_stream_start_clock/);
});

test('code before migration stays compatible; rolled-back writes do not invalidate lists',async()=>{
  const legacy=await setup({revision:false});const first=await legacy.req();assert.equal(first.status,200);assert.equal(first.headers.get('ETag'),null);
  assert.equal((await legacy.req('W/"old"')).status,200);
  const {DB,req,tagOf,raceId}=await setup();const tag=await tagOf();
  DB.db.exec('BEGIN');DB.db.prepare('UPDATE events SET name=? WHERE id=?').run('Uncommitted',raceId);DB.db.exec('ROLLBACK');
  assert.equal((await req(tag)).status,304);
});
